// @flow
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import routes from '../constants/routes.json';

import TitleBar from './TitleBar';
import FileInput from './FileInput';
import TextInput from './TextInput';
import DropDown from './DropDown';

type Props = {};

export default class Home extends Component<Props> {
  props: Props;

  render() {
    return (
      <div className="container" data-tid="container">
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
              <button type="button" className="btn">
                Run
              </button>
            </div>
          </div>
        </div>
        <div className="page-content">
          <h2>Home</h2>
          <Link to={routes.COUNTER}>to Counter</Link>
        </div>
      </div>
    );
  }
}
