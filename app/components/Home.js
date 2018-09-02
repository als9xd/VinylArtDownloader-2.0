// @flow
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { Resize, ResizeHorizon } from 'react-resize-layout';
import routes from '../constants/routes.json';

import TitleBar from './TitleBar';
import FileInput from './FileInput';
import TextInput from './TextInput';
import DropDown from './DropDown';
import MetricsTable from './MetricsTable';

const Scraper = require('../actions/Scraper');

type Props = {};

const scraper = new Scraper({
  MusicBrainz: {
    'Max Pages': 1
  }
});

export default class Home extends Component<Props> {
  props: Props;

  constructor(props) {
    super(props);
    const self = this;

    self.state = {
      metricsTable: scraper.getMetricsTable()
    };

    scraper.on('metrics.refresh', metrics => {
      self.setState({ metricsTable: scraper.getMetricsTable(metrics) });
    });
  }

  render() {
    const { metricsTable } = this.state;

    return (
      <div className="container" data-tid="container">
        <Resize handleWidth="5px" handleColor="#777">
          <ResizeHorizon width="400px" minWidth="200px">
            <div className="sidebar">
              <ul>
                <li>
                  <TitleBar title="Output Directory" />
                  <FileInput title="Output Directory" directory="true" />
                </li>
                <li>
                  <TitleBar title="Database" />
                  <TextInput info="File Name" />
                  <FileInput directory="false" />
                </li>
                <li>
                  <TitleBar title="Scraping" />
                  <TextInput info="Page Offset" />
                  <TextInput info="Max Pages" />
                  <DropDown
                    info="Image Size"
                    options={['Default', 'Small', 'Large']}
                  />
                </li>
              </ul>
              <div className="sidebar-footer">
                <div className="sidebar-footer-container">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      scraper.run(() => {
                        console.log('done');
                      });
                    }}
                  >
                    Run
                  </button>
                </div>
              </div>
            </div>
          </ResizeHorizon>
          <ResizeHorizon minWidth="150px">
            <div className="page-content">
              <MetricsTable data={metricsTable} />
              <h2>Home</h2>
              <Link to={routes.COUNTER}>to Counter</Link>
            </div>
          </ResizeHorizon>
        </Resize>
      </div>
    );
  }
}
