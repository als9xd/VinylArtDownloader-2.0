import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './DropDown.css';

class DropDown extends Component {
  constructor(props) {
    super(props);
    this.onOptionChange = this.onOptionChange.bind(this);
  }

  onOptionChange(evt) {
    const { changeInput } = this.props;
    changeInput(evt.target.value);
  }

  render() {
    const { options, info } = this.props;

    function createOption(option) {
      return <option key={option}>{option}</option>;
    }

    return (
      <div className={styles.dropdown}>
        <div className="row">
          <span className={styles['dropdown-info']}>{info}</span>
          <select onChange={this.onOptionChange}>
            {options.map(option => createOption(option))}
          </select>
        </div>
      </div>
    );
  }
}

DropDown.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string),
  info: PropTypes.string,
  changeInput: PropTypes.func
};

DropDown.defaultProps = {
  options: [],
  info: '',
  changeInput: () => {}
};

export default DropDown;
