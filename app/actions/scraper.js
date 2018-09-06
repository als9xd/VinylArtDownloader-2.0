const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');

const _ = require('lodash');

const request = require('request');

const EventEmitter = require('events');

const winston = require('winston');

const { RateLimiter } = require('limiter');

/* Load Config */

const rename = require('rename-keys');
const typeOf = require('typeof');

/* eslint-disable */
function renameDeep(obj, cb) {
  const type = typeOf(obj);

  if (type !== 'object' && type !== 'array') {
    throw new Error('expected an object');
  }

  let res = [];
  if (type === 'object') {
    obj = rename(obj, cb);
    res = {};
  }

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];
      if (typeOf(val) === 'object' || typeOf(val) === 'array') {
        res[key] = renameDeep(val, cb);
      } else {
        res[key] = val;
      }
    }
  }
  return res;
}
/* eslint-enable */

const configFile = 'config.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

/* Main */

/* eslint-disable no-underscore-dangle */
class Scraper extends EventEmitter {
  constructor(options = {}) {
    super();
    const self = this;

    self.on('lock.set', locked => {
      self._locked = locked;
    });

    self.emit('lock.set', true);

    const parsedConfig = renameDeep(config, key =>
      key
        .split(' ')
        .join('_')
        .toLowerCase()
    );
    const parsedOptions = renameDeep(options, key =>
      key
        .split(' ')
        .join('_')
        .toLowerCase()
    );

    self._options = _.merge({}, parsedConfig, parsedOptions);

    self._initLogger();

    self._initMetrics();
    self
      .getReleaseCount(
        `${
          self._options.musicbrainz.base_url
        }?query=*&type=album&format=Vinyl&limit=1&offset=0&fmt=json`,
        self._options
      )
      .then(releaseCount => {
        self.emit('lock.set', false);
        self.emit('ready');

        self._options.musicbrainz.release_count = releaseCount;
        self.emit('metrics.set', {
          musicbrainz: { release_count: releaseCount }
        });
        const nPages = Math.floor(
          releaseCount / self._options.musicbrainz.releases_per_page
        );
        self.musicbrainz_page_count = nPages;
        self.emit('metrics.set', { musicbrainz: { page_count: nPages } });
        return nPages;
      })
      .catch(err => {
        throw err;
      });
  }

  getOptions() {
    return this._options;
  }

  getMetrics() {
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

    const logDir = path.resolve(__dirname, this._options.logging.directory);
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
    const options = self.getOptions();

    const metricsDefaults = {
      start_time: new Date(),
      coverartarchive: {
        images_downloaded: 0,
        missing_cover_art: 0
      },
      musicbrainz: {
        releases_checked: 0,
        release_count: options.musicbrainz.release_count,
        page_count: options.musicbrainz.page_count,
        pages_scraped: 0,
        page_offset: 0,
        rate_limits: 0
      }
    };

    const numRetryCodes = {};
    Object.keys(options.retry_codes).forEach(key => {
      numRetryCodes[key] = 0;
    });

    self._metrics = Object.assign(metricsDefaults, numRetryCodes);

    if (typeof self._metrics_listeners !== 'undefined') return;
    self._metrics_listeners = {
      'metrics.set': this.on('metrics.set', obj => {
        self._metrics = _.merge({}, self._metrics, obj);
        self.emit('metrics.refresh', self._metrics);
      })
    };
  }

  run(options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options); // eslint-disable-line no-param-reassign
    if (self._locked) return Promise.resolve();
    self.emit('lock.set', true);

    self._initMetrics();

    function _removeTokens(limiter, tokens) {
      return new Promise(resolve => {
        limiter.removeTokens(tokens, resolve);
      });
    }

    return new Promise((resolve, reject) => {
      /* Start Scraping */
      const {
        page_count,
        page_offset,
        releases_per_page,
        base_url
      } = options.musicbrainz;

      const releaseListPageURLs = [];
      for (
        let pageIndex = page_offset;
        pageIndex < page_count + page_offset;
        pageIndex += 1
      ) {
        releaseListPageURLs.push(
          `${base_url}?query=*&type=album&format=Vinyl&limit=${releases_per_page}&offset=${pageIndex *
            releases_per_page}&fmt=json`
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
            self.downloadImage(caaImageURL, options).then(filePath => {
              if (!self._locked) return Promise.resolve();
              self.emit('metrics.set', {
                coverartarchive: {
                  images_downloaded:
                    self.getMetrics().coverartarchive.images_downloaded + 1
                }
              });
              return filePath;
            })
          )
        );

      const _caaReleasePagePromises = urls =>
        Promise.all(
          urls.map(caaReleasePageURL =>
            self
              .getCaaImageURLs(caaReleasePageURL, options)
              .then(caaImageURLs => {
                if (!self._locked) return Promise.resolve();
                self.emit('metrics.set', {
                  musicbrainz: {
                    releases_checked:
                      self.getMetrics().musicbrainz.releases_checked + 1
                  }
                });
                if (!caaImageURLs) {
                  self.emit('metrics.set', {
                    coverartarchive: {
                      missing_cover_art:
                        self.getMetrics().coverartarchive.missing_cover_art + 1
                    }
                  });
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
                console.log(self._locked);
                if (!self._locked) return Promise.resolve();
                self.emit('metrics.set', {
                  musicbrainz: {
                    pages_scraped:
                      self.getMetrics().musicbrainz.pages_scraped + 1
                  }
                });
                return _caaReleasePagePromises(Object.keys(releases));
              })
          )
        );

      /* Finished Scraping */
      return _releaseListPromises(releaseListPageURLs)
        .then(() => {
          self.emit('lock.set', false);
          return resolve();
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  downloadImage(imageURL, options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options); // eslint-disable-line no-param-reassign

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
              const errCodeMetric = {};
              errCodeMetric[err.code.toLowerCase()] =
                self.getMetrics()[err.code.toLowerCase()] + 1;
              self.emit('metrics.set', errCodeMetric);
              return self.downloadImage(imageURL, options);
            }
            reject(err);
          }

          const urlSplit = imageURL.split('/');
          const fileName = urlSplit[urlSplit.length - 1];
          const filePath = path.join(dir, fileName);
          fs.access(dir, fs.constants.F_OK, faErr => {
            if (faErr) {
              if (faErr.code === 'ENOENT') {
                mkdirp(dir, fmErr => {
                  if (fmErr) reject(fmErr);
                  fs.writeFile(filePath, body, 'binary', fwErr => {
                    if (fwErr) reject(fwErr);
                    resolve(filePath);
                  });
                });
                return;
              }
              reject(faErr);
            }
            fs.writeFile(filePath, body, 'binary', fwErr => {
              if (fwErr) reject(fwErr);
              resolve(filePath);
            });
          });
        }
      );
    });
  }

  getCaaImageURLs(caaReleaseURL, options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options); // eslint-disable-line no-param-reassign

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
              const errCodeMetric = {};
              errCodeMetric[err.code.toLowerCase()] =
                self.getMetrics()[err.code.toLowerCase()] + 1;
              self.emit('metrics.set', errCodeMetric);
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
            for (let i = 0; i < imageObjs.length; i += 1) {
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
    options = _.merge({}, self.getOptions(), options); // eslint-disable-line no-param-reassign

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
              const errCodeMetric = {};
              errCodeMetric[err.code.toLowerCase()] =
                self.getMetrics()[err.code.toLowerCase()] + 1;
              self.emit('metrics.set', errCodeMetric);
              return self.getReleases(releaseListURL, options);
            }
            reject(err);
          }

          // Rate limiting
          if (res.statusCode === 503) {
            self.logger.ratelimit('Hit Rate Limit');
            self.emit('metrics.set', {
              musicbrainz: {
                rate_limits_hit:
                  self.getMetrics().musicbrainz.rate_limits_hit + 1
              }
            });
            return self.getReleases(releaseListURL);
          }

          const results = JSON.parse(body);

          const releaseList = results.releases;
          if (typeof releaseList !== 'undefined') {
            const releases = [];
            for (let rIndex = 0; rIndex < releaseList.length; rIndex += 1) {
              const mbid = releaseList[rIndex].id;
              const coverArtUrl = `${options.coverartarchive.base_url}/${mbid}`;
              releases[coverArtUrl] = mbid;
            }
            resolve(releases);
          }
        }
      );
    });
  }

  getReleaseCount(firstReleaseListURL, options = {}) {
    const self = this;
    options = _.merge({}, self.getOptions(), options); // eslint-disable-line no-param-reassign

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
            if (typeof err.code !== 'undefined') {
              if (options.retry_codes[err.code.toLowerCase()] === true) {
                const errCodeMetric = {};
                errCodeMetric[err.code.toLowerCase()] =
                  self.getMetrics()[err.code.toLowerCase()] + 1;
                self.emit('metrics.set', errCodeMetric);
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
/* eslint-enable no-underscore-dangle */

module.exports = Scraper;
