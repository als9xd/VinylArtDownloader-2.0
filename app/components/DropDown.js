import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './DropDown.css';

class DropDown extends Component {
  render() {
    const { options, info } = this.props;

    function createOption(option) {
      return <option key={option}>{option}</option>;
    }

    return (
      <div className={styles.dropdown}>
        <div className="row">
          <span className={styles['dropdown-info']}>{info}</span>
          <select>{options.map(option => createOption(option))}</select>
        </div>
      </div>
    );
  }
}

DropDown.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string),
  info: PropTypes.string
};

DropDown.defaultProps = {
  options: [],
  info: ''
};

export default DropDown;
