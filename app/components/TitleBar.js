import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './TitleBar.css';

class TitleBar extends Component {
  render() {
    const { title } = this.props;

    return (
      <div>
        <div className={styles['input-title']}>{title}</div>
        <div className={`row-break ${styles['row-break']}`} />
      </div>
    );
  }
}

TitleBar.propTypes = {
  title: PropTypes.string
};

TitleBar.defaultProps = {
  title: ''
};

export default TitleBar;
