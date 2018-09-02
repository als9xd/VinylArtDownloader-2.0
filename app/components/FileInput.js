import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './FileInput.css';

class FileInput extends Component {
  constructor(props) {
    super(props);
    this.state = {
      location: ''
    };

    this.updateLocationValue = this.updateLocationValue.bind(this);

    this.locationInput = React.createRef();
    this.triggerInput = this.triggerInput.bind(this);
  }

  updateLocationValue(evt) {
    this.setState({
      location: evt.target.files[0].path
    });
  }

  triggerInput() {
    console.log(this.locationInput);
    this.locationInput.current.click();
  }

  render() {
    const { directory } = this.props;
    const { location } = this.state;

    return (
      <div className={styles['file-input']}>
        <div className="row">
          <span className={styles['location-placeholder']}>
            Location: {location}
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
              onChange={this.updateLocationValue}
              webkitdirectory={directory}
            />
          </label>
        </div>
      </div>
    );
  }
}

FileInput.propTypes = {
  directory: PropTypes.string
};

FileInput.defaultProps = {
  directory: 'false'
};

export default FileInput;
