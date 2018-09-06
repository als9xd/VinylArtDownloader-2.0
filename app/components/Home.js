// @flow
import React, { Component } from 'react';
import { Resize, ResizeHorizon } from 'react-resize-layout';

import { Line } from 'react-chartjs-2';

import TitleBar from './TitleBar';
import FileInput from './FileInput';
import TextInput from './TextInput';
import DropDown from './DropDown';
import MetricsTable from './MetricsTable';

const _ = require('lodash');

const path = require('path');

const Scraper = require('../actions/scraper');

type Props = {};

const scraper = new Scraper();

export default class Home extends Component<Props> {
  props: Props;

  constructor(props) {
    super(props);
    const self = this;

    self.state = {
      running: false,
      metrics: scraper.getMetrics(),
      options: scraper.getOptions(),
      rateData: {
        labels: [],
        datasets: [
          {
            label: 'Checks/Sec',
            borderColor: '#27474E ',
            data: []
          },
          {
            label: 'Downloads/Sec',
            borderColor: '#A93F55',
            data: []
          }
        ]
      }
    };

    scraper.on('metrics.set', obj => {
      const { musicbrainz } = obj;
      switch (true) {
        case musicbrainz && typeof musicbrainz.page_count !== 'undefined':
          this.state.options.musicbrainz.page_count = musicbrainz.page_count; // eslint-disable-line react/destructuring-assignment
          break;
        default:
      }
      const newState = Object.assign({}, this.state);
      newState.metrics = _.merge({}, newState.metrics, obj);
      this.setState(newState);
    });

    scraper.on('metrics.refresh', metrics => {
      const newState = Object.assign({}, this.state);
      newState.metrics = metrics;
      this.setState(newState);
    });

    scraper.on('lock.set', locked => {
      const newState = Object.assign({}, this.state);
      newState.running = locked;
      this.setState(newState);
    });

    this.scrape = this.scrape.bind(this);
    this.onOptionChange = this.onOptionChange.bind(this);
  }

  scrape() {
    const self = this;

    const { options } = self.state;
    if (self.state.running) return;

    scraper.run(options);

    const maxDisplayIntervals = 20;
    const updateTable = setInterval(() => {
      if (!self.state.running) {
        clearInterval(updateTable);
      }
      const newState = Object.assign({}, self.state);

      const metrics = scraper.getMetrics();

      const timeDelta = (new Date() - metrics.start_time) / 1000;

      const checksChartData = newState.rateData.datasets[0].data;
      if (checksChartData.length >= maxDisplayIntervals) {
        checksChartData.shift();
      }
      checksChartData.push(metrics.musicbrainz.releases_checked / timeDelta);
      newState.rateData.datasets[0].data = checksChartData;

      const downloadsChartData = newState.rateData.datasets[1].data;
      if (downloadsChartData.length >= maxDisplayIntervals) {
        downloadsChartData.shift();
      }
      downloadsChartData.push(
        metrics.coverartarchive.images_downloaded / timeDelta
      );
      newState.rateData.datasets[1].data = downloadsChartData;

      const timeChartData = newState.rateData.labels;
      if (timeChartData.length >= maxDisplayIntervals) {
        timeChartData.shift();
      }
      timeChartData.push(Math.round(timeDelta * 10) / 10);
      newState.rateData.labels = timeChartData;
      console.log(newState.rateData);
      self.setState(newState);
    }, 1000);
  }

  onOptionChange(obj) {
    const newState = Object.assign({}, this.state);
    newState.options = _.merge({}, newState.options, obj);
    this.setState(newState);
  }

  render() {
    const { metrics, options, running, rateData } = this.state;
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      elements: {
        point: {
          radius: 0
        }
      },
      scales: {
        xAxes: [{}],
        yAxes: [
          {
            display: true,
            ticks: {
              beginAtZero: true
            }
          }
        ]
      },
      animation: {
        duration: 0
      },
      hover: {
        animationDuration: 0
      },
      responsiveAnimationDuration: 0
    };
    return (
      <div className="container" data-tid="container">
        <Resize handleWidth="5px" handleColor="#777">
          <ResizeHorizon width="350px" minWidth="200px">
            <div className="sidebar">
              <ul>
                <li>
                  <TitleBar title="Output Directory" />
                  <FileInput
                    title="Output Directory"
                    directory="true"
                    value={path.resolve(options.output_directory)}
                    changeInput={newValue =>
                      this.onOptionChange({ output_directory: newValue })
                    }
                  />
                </li>
                <li>
                  <TitleBar title="Database" />
                  <TextInput
                    info="File Name"
                    value={options.database.file_name}
                    changeInput={newValue =>
                      this.onOptionChange({ database: { file_name: newValue } })
                    }
                  />
                  <FileInput
                    directory="false"
                    value={path.resolve(options.database.file_path)}
                    changeInput={newValue =>
                      this.onOptionChange({ database: { file_path: newValue } })
                    }
                  />
                </li>
                <li>
                  <TitleBar title="MusicBrainz" />
                  <TextInput
                    info="Initial Page Offset"
                    type="number"
                    value={options.musicbrainz.page_offset}
                    min={0}
                    max={metrics.musicbrainz.page_count}
                    changeInput={newValue =>
                      this.onOptionChange({
                        musicbrainz: { page_offset: newValue }
                      })
                    }
                  />
                  <TextInput
                    info="Page Count"
                    type="number"
                    min={0}
                    max={
                      metrics.musicbrainz.page_count -
                      options.musicbrainz.page_offset
                    }
                    value={options.musicbrainz.page_count}
                    changeInput={newValue =>
                      this.onOptionChange({
                        musicbrainz: { page_count: newValue }
                      })
                    }
                  />
                </li>
                <li>
                  <TitleBar title="CoverArtArchive" />
                  <DropDown
                    info="Image Size"
                    options={['Default', 'Small', 'Large']}
                    changeInput={newValue =>
                      this.onOptionChange({
                        coverartarchive: { image_size: newValue }
                      })
                    }
                  />
                </li>
              </ul>
              <div className="sidebar-footer">
                <div className="sidebar-footer-container">
                  <button
                    type="button"
                    className={`btn ${running ? 'hidden' : ''}`}
                    onClick={this.scrape}
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    className={`btn ${running ? '' : 'hidden'}`}
                    onClick={() => {
                      scraper.emit('lock.set', false);
                    }}
                  >
                    Stop
                  </button>
                </div>
              </div>
            </div>
          </ResizeHorizon>
          <ResizeHorizon minWidth="150px">
            <div className="page-content">
              <div className="chart-info">
                <Line data={rateData} redraw options={chartOptions} />
              </div>
              <MetricsTable metrics={metrics} options={options} />
            </div>
          </ResizeHorizon>
        </Resize>
      </div>
    );
  }
}
