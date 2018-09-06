import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './TextInput.css';

class TextInput extends Component {
  constructor(props) {
    super(props);
    this.onInputChange = this.onInputChange.bind(this);
  }

  onInputChange(evt) {
    let { value } = evt.target;
    const { changeInput, type } = this.props;
    if (type === 'number') {
      if (value.length === 0) {
        value = '';
      } else {
        value = Number(value);
      }
    }
    changeInput(value);
  }

  render() {
    const { info, type, min, max, value } = this.props;

    return (
      <div className={styles['text-input']}>
        <div className="row">
          <span className={styles['input-info']}>{info}</span>
          <input
            type={type}
            min={min}
            max={max}
            onChange={this.onInputChange}
            value={value}
          />
        </div>
      </div>
    );
  }
}

TextInput.propTypes = {
  info: PropTypes.string,
  type: PropTypes.string,
  min: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  max: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  changeInput: PropTypes.func
};

TextInput.defaultProps = {
  info: '',
  type: 'text',
  min: 0,
  max: 0,
  value: 0,
  changeInput: () => {}
};

export default TextInput;
