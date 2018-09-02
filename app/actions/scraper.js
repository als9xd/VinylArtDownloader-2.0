const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');

const _ = require('lodash');

const request = require('request');

const timeSpan = require('time-span');
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

    this._options = _.merge({}, config, options);

    this._initLogger();

    this._initMetrics();
    this.locked = false;
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

    const elapsedTime = timeSpan();
    const metricsDefaults = {
      total_checked: 0,
      total_downloaded: 0,
      missing_cover_art: 0,
      rate_limits: 0,
      max_musicbrainz_pages: 0,
      musicbrainz_pages_scraped: 0,
      elapsed_time: elapsedTime
    };

    const numRetryCodes = {};
    Object.keys(this._options['Retry Codes']).forEach(key => {
      numRetryCodes[key] = 0;
    });

    this._metrics = _.merge({}, metricsDefaults, numRetryCodes);

    if (typeof this._metrics_listeners !== 'undefined') return;
    this._metrics_listeners = {
      'metrics.set': this.on('metrics.set', (key, value) => {
        self._metrics[key] = value;
        self.emit('metrics.refresh', self._metrics);
      }),

      'metrics.increment': this.on('metrics.increment', key => {
        self._metrics[key]++;
        self.emit('metrics.refresh', self._metrics);
      })
    };
  }

  getMetricsTable(metrics = this._metrics) {
    const self = this;

    const metricsTable = [
      {
        header: {
          title: 'Downloads/Sec',
          color: 'green'
        },
        value: m =>
          parseFloat(
            Math.round((m.total_downloaded / m.elapsed_time()) * 1000 * 100) /
              100
          ).toFixed(2)
      },
      {
        header: {
          title: 'Total Checked',
          color: 'green'
        },
        value: m =>
          `${m.total_checked}/${parseFloat(
            Math.round(
              m.max_musicbrainz_pages *
                self._options['MusicBrainz']['Page Limit'] *
                100
            ) / 100
          ).toFixed(2)}`
      },
      {
        header: {
          title: 'Rate Limits Hit',
          color: 'cyan'
        },
        value: m => m['rate_limits']
      },
      {
        header: {
          title: 'ETIMEDOUT',
          color: 'red'
        },
        value: m => m['ETIMEDOUT']
      },
      {
        header: {
          title: 'ECONNRESET',
          color: 'red'
        },
        value: m => m['ECONNRESET']
      },
      {
        header: {
          title: 'ENOTFOUND',
          color: 'red'
        },
        value: m => m['ENOTFOUND']
      },
      {
        header: {
          title: 'ECONNREFUSED',
          color: 'red'
        },
        value: m => m['ECONNREFUSED']
      }
    ];

    return metricsTable.map(metric => {
      const evaluatedMetric = metric;
      evaluatedMetric.value = evaluatedMetric.value(metrics);
      return evaluatedMetric;
    });
  }

  downloadImage(imageURL, dir) {
    const self = this;
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
            if (self._options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
              return self.downloadImage(imageURL, dir);
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

  getCaaImageURLs(caaReleaseURL) {
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
            if (self._options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
              return self.getCaaImageURLs(caaReleaseURL);
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
                const imageSize = self._options['Image Size'];
                if (imageSize) {
                  imageURLs.push(imageObjs[i]['thumbnails'][imageSize]);
                } else {
                  imageURLs.push(imageObjs[i]['image']);
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

    if (self.locked) callback();
    self.locked = true;

    self._initMetrics();

    function _removeTokens(limiter, tokens) {
      return new Promise(resolve => {
        limiter.removeTokens(tokens, resolve);
      });
    }

    /* Start Scraping */
    const firstReleaseListURL = `${
      options['MusicBrainz']['Base URL']
    }?query=*&type=album&format=Vinyl&limit=1&offset=0`;

    self
      .getReleaseCount(firstReleaseListURL)
      .then(releaseCount => {
        const nPages =
          options['MusicBrainz']['Max Pages'] ||
          releaseCount / options['MusicBrainz']['Page Limit'];

        self.emit('metrics.set', 'max_musicbrainz_pages', nPages);

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
          releaseListPageURL => {
            return _removeTokens(limiter, 1)
              .then(() => {
                return self
                  .getReleases(releaseListPageURL)
                  .then(releases => {
                    self.emit('metrics.increment', 'musicbrainz_pages_scraped');
                    const caaReleasePagePromises = Object.keys(releases).map(
                      caaReleasePageURL => {
                        // const releaseMBID = releases[caaReleasePageURL];
                        return self
                          .getCaaImageURLs(caaReleasePageURL)
                          .then(caaImageURLs => {
                            self.emit('metrics.increment', 'total_checked');
                            if (caaImageURLs === null) {
                              self.emit(
                                'metrics.increment',
                                'missing_cover_art'
                              );
                            }
                            const caaImagePromises = caaImageURLs.map(
                              caaImageURL => {
                                return self
                                  .downloadImage(
                                    caaImageURL,
                                    options['Output Directory']
                                  )
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
              });
          }
        );

        /* Finished Scraping */
        return Promise.all(releaseListPromises)
          .then(() => {
            self.locked = false;
            return callback();
          })
          .catch(err => {
            throw err;
          });
      })
      .catch(err => {
        throw err;
      });
  }

  getReleases(releaseListURL) {
    const self = this;
    return new Promise((resolve, reject) => {
      request(
        releaseListURL,
        {
          rejectUnauthorized: false,
          headers: {
            'User-Agent': self._options['MusicBrainz']['User-Agent']
          },
          agent: false
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if (self._options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
              return self.getReleases(releaseListURL);
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
                  self._options['CoverArtArchive']['Base URL']
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

  getReleaseCount(firstReleaseListURL) {
    const self = this;
    return new Promise((resolve, reject) => {
      request(
        firstReleaseListURL,
        {
          rejectUnauthorized: false,
          headers: {
            'User-Agent': self._options['MusicBrainz']['User-Agent']
          },
          agent: false
        },
        (err, res, body) => {
          if (err) {
            self.logger.http(err);
            if (self._options['Retry Codes'][err.code] === true) {
              self.emit('metrics.increment', err.code);
              return self.getReleaseCount(firstReleaseListURL);
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
