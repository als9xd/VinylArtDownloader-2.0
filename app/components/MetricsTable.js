import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './MetricsTable.css';

class MetricsTable extends Component {

  render() {
    const { metrics} = this.props;
    const topTable = [
      {
        header: 'MusicBrainz Pages Scraped',
        value: `${metrics.musicbrainz_pages_scraped} / ${metrics.musicbrainz_page_count}`,
        color: '#28a745'
      },
      {
        header: 'Releases Checked',
        value: `${metrics.total_checked} / ${metrics.release_count}`,
        color: '#28a745'
      },
      {
        header: 'Cover Art Downloaded',
        value: metrics.total_downloaded,
        color: '#28a745'
      },
      {
        header: 'Cover Art not Available',
        value: metrics.missing_cover_art,
        color: '#ffc107'
      },
    ];

    const vTable1 = [
      {
        header: 'MusicBrainz Rate Limits Hit',
        value: metrics.rate_limits,
        color: 'cyan'
      },

    ]

    const errorTable = [
      {
        header: 'ETIMEDOUT',
        value: metrics.ETIMEDOUT,
        color: '#dc3545'
      },
      {
        header: 'ECONNRESET',
        value: metrics.ECONNRESET,
        color: '#dc3545'
      },
      {
        header: 'ENOTFOUND',
        value: metrics.ENOTFOUND,
        color: '#dc3545'
      },
      {
        header: 'ENETUNREACH',
        value: metrics.ENETUNREACH,
        color: '#dc3545'
      },
      {
        header: 'ECONNREFUSED',
        value: metrics.ECONNREFUSED,
        color: '#dc3545'
      },
    ];


    function buildTableHead(tableData) {
      return tableData.map(item => (
        <th key={item.header} style={{ color: item.color }}>
          {item.header}
        </th>
      ));
    }

    function buildTableBody(tableData) {
      return tableData.map(item => (
        <td key={item.header}>{item.value}</td>
      ));
    }

    function buildHorizontalTable(tableData){
      return tableData.map(item => (
        <tr key={item.header}><td style={{ color: item.color }}>{item.header}</td><td>{item.value}</td></tr>
      ));     
    }

    return (
      <div className={styles['metrics-banner']}>
        <div className={styles['tables-row']}>
          <table className={`${styles['inline-table']}`}>
            <thead>
              <tr>{buildTableHead(topTable)}</tr>
            </thead>
            <tbody>
              <tr>{buildTableBody(topTable)}</tr>
            </tbody>
          </table>
          <table className={`${styles['vertical-table']} ${styles['inline-table']}`}>
            <tbody>
              {buildHorizontalTable(vTable1)}
            </tbody>
          </table>
          <table className={`${styles['vertical-table']} ${styles['inline-table']}`}>
            <tbody>
              {buildHorizontalTable(errorTable)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}

MetricsTable.propTypes = {
  metrics: PropTypes.object
};

MetricsTable.defaultProps = {
  metrics: {}
};

export default MetricsTable;
