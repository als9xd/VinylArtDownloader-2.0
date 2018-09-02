import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './TextInput.css';

class TextInput extends Component {
  render() {
    const { info } = this.props;

    return (
      <div className={styles['text-input']}>
        <div className="row">
          <span className={styles['input-info']}>{info}</span>
          <input type="text" />
        </div>
      </div>
    );
  }
}

TextInput.propTypes = {
  info: PropTypes.string
};

TextInput.defaultProps = {
  info: ''
};

export default TextInput;
