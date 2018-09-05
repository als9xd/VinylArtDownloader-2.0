import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './TextInput.css';

class TextInput extends Component {
  constructor(props) {
    super(props);
    this.state = {
      value: null
    };

    this.onInputChange = this.onInputChange.bind(this);
  }

  onInputChange(evt) {
    const { value } = evt.target;
    const { changeInput } = this.props;
    this.setState({
      value
    });
    changeInput(value);
  }

  render() {
    const { info, type, min, max, def } = this.props;
    const { value } = this.state;

    return (
      <div className={styles['text-input']}>
        <div className="row">
          <span className={styles['input-info']}>{info}</span>
          <input
            type={type}
            min={min}
            max={max}
            onChange={this.onInputChange}
            value={value || def}
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
  def: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  changeInput: PropTypes.func
};

TextInput.defaultProps = {
  info: '',
  type: 'text',
  min: 0,
  max: 0,
  def: '',
  changeInput: () => {}
};

export default TextInput;
