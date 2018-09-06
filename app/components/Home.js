// @flow
import React, { Component } from 'react';
import { Resize, ResizeHorizon } from 'react-resize-layout';

import { Line } from 'react-chartjs-2';

import TitleBar from './TitleBar';
import FileInput from './FileInput';
import TextInput from './TextInput';
import DropDown from './DropDown';
import MetricsTable from './MetricsTable';

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
      ready: false,
      running: false,
      metrics: scraper.metrics,
      options: scraper.getOptions(),
      // Input
      rateData: {
        labels: [],
        datasets: [
          {
            label: 'Checks/Sec',
            borderColor: '#F4A460',
            data: []
          },
          {
            label: 'Downloads/Sec',
            borderColor: '#BC8F8F',
            data: []
          }
        ]
      }
    };

    scraper.on('metrics.set', (key, value) => {
      const newState = Object.assign({}, this.state);
      newState.metrics[key] = value;
      this.setState(newState);
    });

    scraper.on('metrics.refresh',metrics => {
      const newState = Object.assign({}, this.state);
      newState.metrics = metrics;
      this.setState(newState);
    });

    scraper.on('ready', () => {
      const newState = Object.assign({}, this.state);
      newState.ready = true;
      newState.options.musicbrainz.page_count = scraper.page_count;
      this.setState(newState);
    });

    scraper.on('lock_change', status => {
      const newState = Object.assign({}, this.state);
      newState.running = status;
      this.setState(newState);
    });

    this.scrape = this.scrape.bind(this);
  }

  scrape() {
    const self = this;

    scraper.run(this.state._options);

    const maxDisplayIntervals = 20;
    const updateTable = setInterval(() => {
      if (!self.state.running) {
        clearInterval(updateTable);
      }
      const newState = Object.assign({}, self.state);
      const { metrics } = scraper;

      const timeDelta = (new Date() - metrics.start_time) / 1000;

      const checksChartData = newState.rateData.datasets[0].data;
      if (checksChartData.length >= maxDisplayIntervals) {
        checksChartData.shift();
      }
      checksChartData.push(metrics.total_checked / timeDelta);
      newState.rateData.datasets[0].data = checksChartData;

      const downloadsChartData = newState.rateData.datasets[1].data;
      if (downloadsChartData.length >= maxDisplayIntervals) {
        downloadsChartData.shift();
      }
      downloadsChartData.push(metrics.total_downloaded / timeDelta);
      newState.rateData.datasets[1].data = downloadsChartData;

      const timeChartData = newState.rateData.labels;
      if (timeChartData.length >= maxDisplayIntervals) {
        timeChartData.shift();
      }
      timeChartData.push(Math.round(timeDelta * 10) / 10);
      newState.rateData.labels = timeChartData;

      self.setState(newState);
    }, 1000);
  }

  onOutputDirectoryChange(newOutputDirectory) {
    const newState = Object.assign({}, this.state);
    newState.options.output_directory = newOutputDirectory;
    this.setState(newState);
  }

  onDatabaseFileNameChange(newDatabaseFileName) {
    const databaseFullPath = path.resolve(newDatabaseFileName);

    const newState = Object.assign({}, this.state);
    newState.options.database = {
      location: databaseFullPath,
      file_name: path.basename(databaseFullPath),
      file_path: path.dirname(databaseFullPath)
    }

    this.setState(newState);
  }

  onDatabaseFilePathChange(newDatabasePathName) {
    // eslint-disable-next-line react/destructuring-assignment
    const databaseFullPath = path.join(
      newDatabasePathName,
      this.state.options.database.file_name
    );

    const newState = Object.assign({}, this.state);
    newState.database = {
      location: databaseFullPath,
      file_name: path.basename(databaseFullPath),
      file_path: path.dirname(databaseFullPath)
    };
    this.setState(newState);
  }

  onPageOffsetChange(newPageOffset) {
    const newState = Object.assign({}, this.state);
    newState.options.musicbrainz_page_offset = Number(newPageOffset);
    this.setState(newState);
  }

  onPageCountChange(newPageCount) {
    const newState = Object.assign({}, this.state);
    newState.options.musicbrainz_page_count = Number(newPageCount);
    this.setState(newState);
  }

  onImageSizeChange(newImageSize) {
    const newState = Object.assign({}, this.state);
    newState.options.image_size = newImageSize === 'default' ? null : newImageSize;
    this.setState(newState);
  }

  render() {
    const { metrics, ready, running, rateData } = this.state;
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
                    value={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state.output_directory
                    }
                    changeFileInput={this.onOutputDirectoryChange.bind(this)}
                  />
                </li>
                <li>
                  <TitleBar title="Database" />
                  <TextInput
                    info="File Name"
                    value={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state.options.database.file_name
                    }
                    changeInput={this.onDatabaseFileNameChange.bind(this)}
                  />
                  <FileInput
                    directory="false"
                    value={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state.options.database.file_path
                    }
                    changeFileInput={this.onDatabaseFilePathChange.bind(this)}
                  />
                </li>
                <li>
                  <TitleBar title="MusicBrainz" />
                  <TextInput
                    info="Initial Page Offset"
                    type="number"
                    value={0}
                    min={0}
                    max={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state.metrics.musicbrainz.page_count
                    }
                    changeInput={this.onPageOffsetChange.bind(this)}
                  />
                  <TextInput
                    info="Page Count"
                    type="number"
                    min={0}
                    max={
                      // eslint-disable-next-line react/destructuring-assignment
                      (this.state.metrics.musicbrainz.page_count  || 0) - this.state.options.musicbrainz.page_offset
                    }
                    value={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state.metrics.musicbrainz.page_count
                    }
                    changeInput={this.onPageCountChange.bind(this)}
                  />
                </li>
                <li>
                  <TitleBar title="CoverArtArchive" />
                  <DropDown
                    info="Image Size"
                    options={['Default', 'Small', 'Large']}
                    changeDropdownOption={this.onImageSizeChange.bind(this)}
                  />
                </li>
              </ul>
              <div className="sidebar-footer">
                <div className="sidebar-footer-container">
                  <button
                    type="button"
                    className={`btn ${ready ? '' : 'hidden'}`}
                    onClick={this.scrape}
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    className={`btn ${running ? '' : 'hidden'}`}
                    onClick={this.scrape}
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
              <MetricsTable metrics={metrics} />
            </div>
          </ResizeHorizon>
        </Resize>
      </div>
    );
  }
}
