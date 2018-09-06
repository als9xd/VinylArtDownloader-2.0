const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');

const _ = require('lodash');

const request = require('request');

const EventEmitter = require('events');

const winston = require('winston');

const { RateLimiter } = require('limiter');


/* Load Config */

const configFile = 'config.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

/* Main */

const rename = require('rename-keys');
const typeOf = require('typeOf');
function renameDeep(obj, cb) {
  var type = typeOf(obj);

  if (type !== 'object' && type !== 'array') {
    throw new Error('expected an object');
  }

  var res = [];
  if (type === 'object') {
    obj = rename(obj, cb);
    res = {};
  }

  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      var val = obj[key];
      if (typeOf(val) === 'object' || typeOf(val) === 'array') {
        res[key] = renameDeep(val, cb);
      } else {
        res[key] = val;
      }
    }
  }
  return res;
};

class Scraper extends EventEmitter {
  constructor(options = {}) {
    super();
    const self = this;
    self.emit('lock.set',true);

    const parsedConfig = renameDeep(config, function(key) {
      return key.split(' ').join('_').toLowerCase();
    });

    const parsedOptions = renameDeep(options, function(key) {
      return key.replace(' ','_').toLowerCase();
    });

    self._options = _.merge({}, parsedConfig, parsedOptions);

    self._initLogger();

    self._initMetrics();
    self.getReleaseCount(
      `${
        self._options.musicbrainz.base_url
      }?query=*&type=album&format=Vinyl&limit=1&offset=0&fmt=json`,
      self._options
    )
      .then(releaseCount => {
        self.locked = false;
        self.emit('lock_change', self.locked);
        self.emit('ready');

        self._options.musicbrainz.release_count = releaseCount;
        self.emit('metrics.set',{musicbrainz:{release_count:releaseCount}});
        const nPages = Math.floor(
          releaseCount / self._options.musicbrainz.page_limit
        );
        self.musicbrainz_page_count = nPages;
        self.emit('metrics.set',{musicbrainz:{page_count:nPages}});
        return nPages;
      })
      .catch(err => {
        throw err;
      });
  }

  getOptions(){
    return this._options;
  }

  getMetrics(){
    return this._metrics;
  }

  _initLogger() {
    const loggerConfig = {
      levels: {
        error: 0,
        warn: 1,
        success: 2,
        info: 3,
        ratelimit: 4,
        http: 5,
        verbose: 6,
        debug: 7,
        silly: 8
      },
      colors: {
        error: 'red',
        warn: 'yellow',
        success: 'green',
        info: 'gray',
        ratelimit: 'magenta',
        http: 'cyan',
        verbose: 'blue',
        debug: 'white',
        silly: 'pink'
      }
    };

    const logDir = path.resolve(
      __dirname,
      this._options.logging.directory
    );
    if (!fs.existsSync(logDir)) {
      mkdirp.sync(logDir);
    }

    this.logger = winston.createLogger({
      levels: loggerConfig.levels,
      json: false,
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          format: winston.format.simple(),
          filename: path.resolve(logDir, 'info.log'),
          level: 'info'
        }),
        new winston.transports.File({
          json: true,
          filename: path.resolve(logDir, 'http.log'),
          level: 'http'
        })
      ]
    });
    winston.addColors(loggerConfig.colors);
  }

  _initMetrics() {
    const self = this;

    let options = self.getOptions();

    const metricsDefaults = {
      start_time: new Date(),
      coverartarchive:{
        total_checked: 0,
        total_downloaded: 0,
      },
      release_count: options.musicbrainz.release_count,
      missing_cover_art: 0,
      rate_limits: 0,
      musicbrainz: {
        page_count: options.musicbrainz.page_count,
        pages_scraped: 0,
        page_offset: 0,
      }
    };

    const numRetryCodes = {};
    Object.keys(options.retry_codes).forEach(key => {
      numRetryCodes[key] = 0;
    });

    self._metrics = Object.assign(metricsDefaults, numRetryCodes);

    if (typeof self._metrics_listeners !== 'undefined') return;
    self._metrics_listeners = {
      'metrics.set': this.on('metrics.set', (obj) => {
        self._metrics = _.merge({}, self._metrics, obj);
        self.emit('metrics.refresh', self._metrics);
      }),

      'metrics.increment': this.on('metrics.increment', key => {
        self._metrics[key]=self._metrics[key]+1;
        self.emit('metrics.refresh', self._metrics);
      })
    };
  }

  run(options={}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options);

    if (self._locked) callback();
    self.emit('lock.set', true);

    self._initMetrics();

    function _removeTokens(limiter, tokens) {
      return new Promise(resolve => {
        limiter.removeTokens(tokens, resolve);
      });
    }

    return new Promise(
      (resolve,reject) => {
        /* Start Scraping */
        const { 
          page_count, 
          page_offset, 
          page_limit,
          base_url
        } = options.musicbrainz;

        const releaseListPageURLs = [];
        for (let pageIndex = page_offset;pageIndex < page_count + page_offset;pageIndex++) {
          releaseListPageURLs.push(
            `${
              base_url
            }?query=*&type=album&format=Vinyl&limit=${
              page_limit
            }&offset=${pageIndex * page_limit}&fmt=json`
          );
        }

        // https://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
        const limiter = new RateLimiter(
          options.musicbrainz.requests_per_sec,
          'second'
        );

        const _caaImagePromises = caaImageURLs => 
          Promise.all(
            caaImageURLs.map(caaImageURL => 
              self.downloadImage(caaImageURL, options)                      
              .then(filePath => {
                self.emit('metrics.increment','coverartarchive.images_downloaded');
                return filePath;
              }) 
          )
        );

        const _caaReleasePagePromises = (url) => 
          Promise.all(
            url.map(caaReleasePageURL => 
              self.getCaaImageURLs(caaReleasePageURL, options)
              .then(caaImageURLs => {
                self.emit('metrics.increment', 'coverartarchive.total_checked');
                if (!caaImageURLs) {
                  self.emit('metrics.increment', 'coverartarchive.missing_cover_art');
                  return;
                }
                return _caaImagePromises(caaImageURLs);
              })
          )
        );

        const _releaseListPromises = urls => 
          Promise.all(
            urls.map(url => 
              _removeTokens(limiter, 1)
              .then(() => self.getReleases(url, options))
              .then(releases => {
                self.emit('metrics.increment', 'musicbrainz.pages_scraped');
                return _caaReleasePagePromises(Object.keys(releases));
              })
          )
        );

        /* Finished Scraping */
        return _releaseListPromises(releaseListPageURLs)
        .then(() => {
          self.emit('lock.set', false);
          resolve();
        })
        .catch(err => {
          reject(err);
        });        
      }
    );
  }

  downloadImage(imageURL, options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options);

    const dir = options.output_directory;
    return new Promise((resolve, reject) => {
      request(
        imageURL,
        {
          rejectUnauthorized: false,
          encoding: 'binary'
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if (options.retry_codes[err.code.toLowerCase()] === true) {
              self.emit('metrics.increment', err.code.toLowerCase());
              return self.downloadImage(imageURL, options);
            }
            reject(err);
          }

          const urlSplit = imageURL.split('/');
          const fileName = urlSplit[urlSplit.length - 1];
          const filePath = path.join(dir, fileName);
          fs.access(dir, fs.constants.F_OK, err => {
            if (err) {
              if (err.code === 'ENOENT') {
                mkdirp(dir, err => {
                  if (err) reject(err);
                  fs.writeFile(filePath, body, 'binary', err => {
                    if (err) reject(err);
                    resolve(filePath);
                  });
                });
                return;
              }
              reject(err);
            }
            fs.writeFile(filePath, body, 'binary', err => {
              if (err) reject(err);
              resolve(filePath);
            });
          });
        }
      );
    });
  }

  getCaaImageURLs(caaReleaseURL, options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options);

    return new Promise((resolve, reject) => {
      request(
        caaReleaseURL,
        {
          rejectUnauthorized: false,
          json: true
        },
        (err, res) => {
          if (err) {
            self.logger.http(err);
            if (options.retry_codes[err.code.toLowerCase()] === true) {
              self.emit('metrics.increment', err.code.toLowerCase());
              return self.getCaaImageURLs(caaReleaseURL, options);
            }
            reject(err);
          }
          // Doesn't have cover art
          if (res.statusCode === 404) {
            resolve(null);
            return;
          }

          const imageURLs = [];
          const imageObjs = res.body.images;
          if (typeof imageObjs !== 'undefined') {
            for (let i = 0; i < imageObjs.length; i++) {
              if (imageObjs[i].front === true) {
                const imageSize = options.coverartarchive.image_size.toLowerCase();
                if (imageSize === 'default') {
                  imageURLs.push(imageObjs[i].image);
                } else if (
                  typeof imageObjs[i].thumbnails[imageSize] !== 'undefined'
                ) {
                  imageURLs.push(imageObjs[i].thumbnails[imageSize]);
                }
              }
            }
          }
          resolve(imageURLs);
        }
      );
    });
  }

  getReleases(releaseListURL, options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options);

    return new Promise((resolve, reject) => {
      request(
        releaseListURL,
        {
          rejectUnauthorized: false,
          headers: {
            'User-Agent': options.musicbrainz.user_agent
          },
          agent: false
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if (options.retry_codes[err.code.toLowerCase()] === true) {
              self.emit('metrics.increment', err.code.toLowerCase());
              return self.getReleases(releaseListURL, options);
            }
            reject(err);
          }

          // Rate limiting
          if (res.statusCode === 503) {
            self.logger.ratelimit('Hit Rate Limit');
            self.emit('metrics.increment', 'rate_limits_hit');
            return self.getReleases(releaseListURL);
          }
          let results = JSON.parse(body);
          
          const releaseList = results['releases'];
          if (typeof releaseList !== 'undefined') {
            const releases = [];
            for (let rIndex = 0; rIndex < releaseList.length; rIndex++) {
              const mbid = releaseList[rIndex]['id'];
              const coverArtUrl = `${options.coverartarchive.base_url}/${mbid}`;
              releases[coverArtUrl] = mbid;
            }
            resolve(releases);
          }
        }
      );
    });
  }

  getReleaseCount(firstReleaseListURL, options = this._options) {
    const self = this;
    return new Promise((resolve, reject) => {
      request(
        firstReleaseListURL,
        {
          rejectUnauthorized: false,
          headers: {
            'User-Agent': options.musicbrainz.user_agent
          },
          agent: false
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if(typeof err.code !== 'undefined'){
              if (options.retry_codes[err.code.toLowerCase()] === true) {
                self.emit('metrics.increment', err.code.toLowerCase());
                return self.getReleaseCount(firstReleaseListURL, options);
              }              
            }
            reject(err);
          }
          resolve(JSON.parse(body).count);
        }
      );
    });
  }
}

module.exports = Scraper;
