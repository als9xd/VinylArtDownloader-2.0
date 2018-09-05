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

const scraper = new Scraper({
  MusicBrainz: {
    'Page Count': 1
  }
});

export default class Home extends Component<Props> {
  props: Props;

  constructor(props) {
    super(props);
    const self = this;

    self.state = {
      ready: false,
      running: false,
      metricsTable: scraper.getMetricsTable(),
      // Input
      'Output Directory': path.resolve(scraper.defaults['Output Directory']),
      Database: {
        Location: path.resolve(scraper.defaults['Database']['Location']),
        'File Name': path.basename(scraper.defaults['Database']['Location']),
        'File Path': path.resolve(
          path.dirname(scraper.defaults['Database']['Location'])
        )
      },
      MusicBrainz: {
        'Page Offset': scraper.defaults['MusicBrainz']['Page Offset'],
        'Page Count': scraper.defaults['MusicBrainz']['Page Count']
      },
      'Image Size': 'Default',
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
      switch (key) {
        case 'musicbrainz_page_count':
          newState['MusicBrainz']['Page Count'] = value;
          break;
        default:
      }
      this.setState(newState);
    });

    scraper.on('ready', () => {
      const newState = Object.assign({}, this.state);
      newState.ready = true;
      newState['MusicBrainz']['Page Count'] = scraper.page_count;
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

    scraper.run(this.state);

    const maxDisplayIntervals = 20;
    const updateTable = setInterval(() => {
      if (!scraper.locked) {
        clearInterval(updateTable);
      }
      const newState = Object.assign({}, self.state);
      const { metrics } = scraper;

      const timeDelta = (new Date() - metrics['start_time']) / 1000;

      const checksChartData = newState.rateData.datasets[0].data;
      if (checksChartData.length >= maxDisplayIntervals) {
        checksChartData.shift();
      }
      checksChartData.push(metrics['total_checked'] / timeDelta);
      newState.rateData.datasets[0].data = checksChartData;

      const downloadsChartData = newState.rateData.datasets[1].data;
      if (downloadsChartData.length >= maxDisplayIntervals) {
        downloadsChartData.shift();
      }
      downloadsChartData.push(metrics['total_downloaded'] / timeDelta);
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
    newState['Output Directory'] = newOutputDirectory;
    this.setState(newState);
  }

  onDatabaseFileNameChange(newDatabaseFileName) {
    const databaseFullPath = path.resolve(newDatabaseFileName);

    const newState = Object.assign({}, this.state);
    newState['Database'] = {
      Location: databaseFullPath,
      'File Name': path.basename(databaseFullPath),
      'File Path': path.dirname(databaseFullPath)
    };
    this.setState(newState);
  }

  onDatabaseFilePathChange(newDatabasePathName) {
    // eslint-disable-next-line react/destructuring-assignment
    const databaseFullPath = path.join(
      newDatabasePathName,
      this.state['Database']['File Name']
    );

    const newState = Object.assign({}, this.state);
    newState['Database'] = {
      Location: databaseFullPath,
      'File Name': path.basename(databaseFullPath),
      'File Path': path.dirname(databaseFullPath)
    };
    this.setState(newState);
  }

  onPageOffsetChange(newPageOffset) {
    const newState = Object.assign({}, this.state);
    newState['MusicBrainz']['Page Offset'] = Number(newPageOffset);
    this.setState(newState);
  }

  onPageCountChange(newPageCount) {
    const newState = Object.assign({}, this.state);
    newState['MusicBrainz']['Page Count'] = Number(newPageCount);
    this.setState(newState);
  }

  onImageSizeChange(newImageSize) {
    const newState = Object.assign({}, this.state);
    newState['Image Size'] = newImageSize === 'Default' ? null : newImageSize;
    this.setState(newState);
  }

  render() {
    const { metricsTable, ready, running, rateData } = this.state;
    const chartOptions = {
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
          <ResizeHorizon width="500px" minWidth="200px">
            <div className="sidebar">
              <ul>
                <li>
                  <TitleBar title="Output Directory" />
                  <FileInput
                    title="Output Directory"
                    directory="true"
                    def={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state['Output Directory']
                    }
                    changeFileInput={this.onOutputDirectoryChange.bind(this)}
                  />
                </li>
                <li>
                  <TitleBar title="Database" />
                  <TextInput
                    info="File Name"
                    def={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state['Database']['File Name']
                    }
                    changeInput={this.onDatabaseFileNameChange.bind(this)}
                  />
                  <FileInput
                    directory="false"
                    def={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state['Database']['File Path']
                    }
                    changeFileInput={this.onDatabaseFilePathChange.bind(this)}
                  />
                </li>
                <li>
                  <TitleBar title="MusicBrainz" />
                  <TextInput
                    info="Initial Page Offset"
                    type="number"
                    def={0}
                    min="0"
                    max={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state['MusicBrainz']['Page Count']
                    }
                    changeInput={this.onPageOffsetChange.bind(this)}
                  />
                  <TextInput
                    info="Page Count"
                    type="number"
                    def={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state['MusicBrainz']['Page Count']
                    }
                    min="0"
                    max={
                      // eslint-disable-next-line react/destructuring-assignment
                      this.state['MusicBrainz']['Page Count'] -
                      this.state['MusicBrainz']['Page Offset']
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
              <Line data={rateData} redraw options={chartOptions} />
              <MetricsTable data={metricsTable} />
            </div>
          </ResizeHorizon>
        </Resize>
      </div>
    );
  }
}
