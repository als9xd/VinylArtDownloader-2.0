import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './MetricsTable.css';

class MetricsTable extends Component {
  render() {
    const { data } = this.props;

    function buildTableHead(tableData) {
      return tableData.map(item => (
        <th key={item.header.title} style={{ color: item.header.color }}>
          {item.header.title}
        </th>
      ));
    }

    function buildTableBody(tableData) {
      return tableData.map(item => (
        <td key={item.header.title}>{item.value}</td>
      ));
    }

    return (
      <div className={styles['metrics-banner']}>
        <div className="row">
          <table>
            <thead>
              <tr>{buildTableHead(data)}</tr>
            </thead>
            <tbody>
              <tr>{buildTableBody(data)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}

MetricsTable.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object)
};

MetricsTable.defaultProps = {
  data: []
};

export default MetricsTable;
