import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './FileInput.css';

class FileInput extends Component {
  constructor(props) {
    super(props);
    this.state = {
      location: null
    };

    this.locationInput = React.createRef();
    this.triggerInput = this.triggerInput.bind(this);

    this.onFileInputChange = this.onFileInputChange.bind(this);
  }

  triggerInput() {
    this.locationInput.current.click();
  }

  onFileInputChange(evt) {
    const { changeFileInput } = this.props;
    this.setState({
      location: evt.target.files[0].path
    });
    changeFileInput(evt.target.files[0].path);
  }

  render() {
    const { directory, def } = this.props;
    const { location } = this.state;

    return (
      <div className={styles['file-input']}>
        <div className="row">
          <span className={styles['location-placeholder']}>
            Location:
            <div className={styles['location-placeholder-value']}>
              {' '}
              {location || def}
            </div>
          </span>
          <label
            htmlFor={this.locationInput}
            onClick={this.triggerInput}
            className={`btn ${styles['file-input-btn']}`}
          >
            Change Location
            <input
              ref={this.locationInput}
              type="file"
              onChange={this.onFileInputChange}
              webkitdirectory={directory}
            />
          </label>
        </div>
      </div>
    );
  }
}

FileInput.propTypes = {
  directory: PropTypes.string,
  changeFileInput: PropTypes.func,
  def: PropTypes.string
};

FileInput.defaultProps = {
  directory: 'false',
  changeFileInput: () => {},
  def: ''
};

export default FileInput;
