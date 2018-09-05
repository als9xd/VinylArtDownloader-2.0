const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');

const _ = require('lodash');

const request = require('request');

const EventEmitter = require('events');

const winston = require('winston');

const { RateLimiter } = require('limiter');

const { parseString } = require('xml2js');

/* Load Config */

const configFile = 'config.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

/* Main */

class Scraper extends EventEmitter {
  constructor(options = {}) {
    super();
    const self = this;
    this.locked = true;

    this._options = _.merge({}, config, options);
    this.defaults = this._options;

    this._initLogger();

    this._initMetrics();
    this.getReleaseCount(
      `${
        this._options['MusicBrainz']['Base URL']
      }?query=*&type=album&format=Vinyl&limit=1&offset=0`,
      this._options
    )
      .then(releaseCount => {
        self.locked = false;
        self.emit('lock_change', self.locked);
        self.emit('ready');

        self.emit('metrics.set','release_count',releaseCount);
        const nPages = Math.floor(
          releaseCount / self._options['MusicBrainz']['Page Limit']
        );

        self.emit('metrics.set', 'musicbrainz_page_count', nPages);
        return nPages;
      })
      .catch(err => {
        throw err;
      });
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
      this._options['Logging']['Directory']
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

    const metricsDefaults = {
      start_time: new Date(),
      total_checked: 0,
      total_downloaded: 0,
      missing_cover_art: 0,
      rate_limits: 0,
      musicbrainz_page_count: 0,
      musicbrainz_pages_scraped: 0,
      musicbrainz: {

      }
    };

    const numRetryCodes = {};
    Object.keys(this._options['Retry Codes']).forEach(key => {
      numRetryCodes[key] = 0;
    });

    this.metrics = _.merge({}, metricsDefaults, numRetryCodes);

    if (typeof this.metrics_listeners !== 'undefined') return;
    this.metrics_listeners = {
      'metrics.set': this.on('metrics.set', (key, value) => {
        self.metrics[key] = value;
        self.emit('metrics.refresh', self.metrics);
      }),

      'metrics.increment': this.on('metrics.increment', key => {
        self.metrics[key]++;
        self.emit('metrics.refresh', self.metrics);
      })
    };
  }

  downloadImage(imageURL, options = this._options) {
    const self = this;
    const dir = options['Output Directory'];
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
            if (options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
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

  getCaaImageURLs(caaReleaseURL, options = this._options) {
    const self = this;

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
            if (options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
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
          const imageObjs = res.body['images'];
          if (typeof imageObjs !== 'undefined') {
            for (let i = 0; i < imageObjs.length; i++) {
              if (imageObjs[i]['front'] === true) {
                const imageSize = options['Image Size'].toLowerCase();
                if (imageSize === 'default') {
                  imageURLs.push(imageObjs[i]['image']);
                } else if (
                  typeof imageObjs[i]['thumbnails'][imageSize] !== 'undefined'
                ) {
                  imageURLs.push(imageObjs[i]['thumbnails'][imageSize]);
                }
              }
            }
          }
          resolve(imageURLs);
        }
      );
    });
  }

  run(a = {}, b) {
    const self = this;

    let options;
    let callback;
    if (typeof a === 'object') {
      options = _.merge({}, self._options, a);
      callback = b;
    } else {
      options = self._options;
      callback = a;
    }
    if (typeof callback === 'undefined') {
      callback = () => {};
    }

    if (self.locked) callback();
    self.locked = true;
    self.emit('lock_change', self.locked);

    self._initMetrics();

    function _removeTokens(limiter, tokens) {
      return new Promise(resolve => {
        limiter.removeTokens(tokens, resolve);
      });
    }

    /* Start Scraping */
    const nPages = options['MusicBrainz']['Page Count'];
    const releaseListPageURLs = [];
    const musicbrainzPageOffset = options['MusicBrainz']['Page Offset'];
    for (
      let cPage = musicbrainzPageOffset;
      cPage < nPages + musicbrainzPageOffset;
      cPage++
    ) {
      releaseListPageURLs.push(
        `${
          options['MusicBrainz']['Base URL']
        }?query=*&type=album&format=Vinyl&limit=${
          options['MusicBrainz']['Page Limit']
        }&offset=${cPage * options['MusicBrainz']['Page Limit']}`
      );
    }

    // https://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
    const limiter = new RateLimiter(
      options['MusicBrainz']['Requests/Sec'],
      'second'
    );

    const releaseListPromises = releaseListPageURLs.map(
      // eslint-disable-next-line arrow-body-style
      releaseListPageURL => {
        return (
          _removeTokens(limiter, 1)
            // eslint-disable-next-line arrow-body-style
            .then(() => {
              return self
                .getReleases(releaseListPageURL, options)
                .then(releases => {
                  self.emit('metrics.increment', 'musicbrainz_pages_scraped');
                  const caaReleasePagePromises = Object.keys(releases).map(
                    // eslint-disable-next-line arrow-body-style
                    caaReleasePageURL => {
                      // const releaseMBID = releases[caaReleasePageURL];
                      return self
                        .getCaaImageURLs(caaReleasePageURL, options)
                        .then(caaImageURLs => {
                          self.emit('metrics.increment', 'total_checked');
                          if (!caaImageURLs) {
                            self.emit('metrics.increment', 'missing_cover_art');
                            return;
                          }
                          const caaImagePromises = caaImageURLs.map(
                            // eslint-disable-next-line arrow-body-style
                            caaImageURL => {
                              return self
                                .downloadImage(caaImageURL, options)
                                .then(filePath => {
                                  self.emit(
                                    'metrics.increment',
                                    'total_downloaded'
                                  );
                                  return filePath;
                                })
                                .catch(err => {
                                  throw err;
                                });
                            }
                          );
                          return Promise.all(caaImagePromises);
                        })
                        .catch(err => {
                          throw err;
                        });
                    }
                  );
                  return Promise.all(caaReleasePagePromises);
                })
                .catch(err => {
                  throw err;
                });
            })
            .catch(err => {
              throw err;
            })
        );
      }
    );

    /* Finished Scraping */
    return Promise.all(releaseListPromises)
      .then(() => {
        self.locked = false;
        self.emit('lock_change', self.locked);
        return callback();
      })
      .catch(err => {
        throw err;
      });
  }

  getReleases(releaseListURL, options = this._options) {
    const self = this;
    return new Promise((resolve, reject) => {
      request(
        releaseListURL,
        {
          rejectUnauthorized: false,
          headers: {
            'User-Agent': options['MusicBrainz']['User-Agent']
          },
          agent: false
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if (options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
              return self.getReleases(releaseListURL, options);
            }
            reject(err);
          }

          // Rate limiting
          if (res.statusCode === 503) {
            self.logger.ratelimit('Hit Rate Limit');
            self.emit('metrics.increment', 'Rate Limits	Hit');
            return self.getReleases(releaseListURL);
          }
          parseString(body, (err, result) => {
            if (err) reject(err);

            const releases = [];
            const releaseList =
              result['metadata']['release-list'][0]['release'];
            if (typeof releaseList !== 'undefined') {
              for (let rIndex = 0; rIndex < releaseList.length; rIndex++) {
                const mbid = releaseList[rIndex]['$']['id'];
                const coverArtUrl = `${
                  options['CoverArtArchive']['Base URL']
                }/${mbid}`;
                releases[coverArtUrl] = mbid;
              }
              resolve(releases);
            }
          });
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
            'User-Agent': options['MusicBrainz']['User-Agent']
          },
          agent: false
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if (options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
              return self.getReleaseCount(firstReleaseListURL, options);
            }
            reject(err);
          }

          parseString(body, (err, result) => {
            if (err) reject(err);
            resolve(result['metadata']['release-list'][0]['$']['count']);
          });
        }
      );
    });
  }
}

module.exports = Scraper;
