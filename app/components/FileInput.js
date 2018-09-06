import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './FileInput.css';

class FileInput extends Component {
  constructor(props) {
    super(props);

    this.locationInput = React.createRef();
    this.triggerInput = this.triggerInput.bind(this);

    this.onFileInputChange = this.onFileInputChange.bind(this);
  }

  triggerInput() {
    this.locationInput.current.click();
  }

  onFileInputChange(evt) {
    const { changeInput } = this.props;
    changeInput(evt.target.files[0].path);
  }

  render() {
    const { directory, value } = this.props;

    return (
      <div className={styles['file-input']}>
        <div className="row">
          <span className={styles['location-placeholder']}>
            Location:
            {'\u00A0'}
            <div className={styles['location-placeholder-value']}>{value}</div>
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
  changeInput: PropTypes.func,
  value: PropTypes.string
};

FileInput.defaultProps = {
  directory: 'false',
  changeInput: () => {},
  value: ''
};

export default FileInput;
