import React, { Component } from 'react';
import PropTypes from 'prop-types';

import styles from './MetricsTable.css';

class MetricsTable extends Component {
  render() {
    const { metrics, options } = this.props;
    const hTable1 = [
      {
        header: 'MusicBrainz Release Pages Processed',
        value: `${metrics.musicbrainz.pages_scraped} / ${
          options.musicbrainz.page_count
        }`,
        color: '#28a745'
      },
      {
        header: 'MusicBrainz Releases Checked',
        value: `${metrics.musicbrainz.releases_checked} / ${options.musicbrainz
          .page_count * options.musicbrainz.releases_per_page}`,
        color: '#28a745'
      },
      {
        header: 'CoverArtArchive Images Downloaded',
        value: metrics.coverartarchive.images_downloaded,
        color: '#28a745'
      },
      {
        header: 'CoverArtArchive Images Not Available',
        value: metrics.coverartarchive.missing_cover_art,
        color: '#ffc107'
      }
    ];

    const vTable1 = [
      {
        header: 'MusicBrainz Rate Limits Hit',
        value: metrics.musicbrainz.rate_limits,
        color: 'cyan'
      }
    ];

    const vTable2 = [
      {
        header: 'ETIMEDOUT',
        value: metrics.etimedout,
        color: '#dc3545'
      },
      {
        header: 'ECONNRESET',
        value: metrics.econnreset,
        color: '#dc3545'
      },
      {
        header: 'ENOTFOUND',
        value: metrics.enotfound,
        color: '#dc3545'
      },
      {
        header: 'ENETUNREACH',
        value: metrics.enetunreach,
        color: '#dc3545'
      },
      {
        header: 'ECONNREFUSED',
        value: metrics.econnrefused,
        color: '#dc3545'
      }
    ];

    function buildTableHead(tableData) {
      return tableData.map(item => (
        <th key={item.header} style={{ color: item.color }}>
          {item.header}
        </th>
      ));
    }

    function buildTableBody(tableData) {
      return tableData.map(item => <td key={item.header}>{item.value}</td>);
    }

    function buildHorizontalTable(tableData) {
      return tableData.map(item => (
        <tr key={item.header}>
          <td style={{ color: item.color }}>{item.header}</td>
          <td>{item.value}</td>
        </tr>
      ));
    }

    return (
      <div className={styles['metrics-banner']}>
        <div className={styles['tables-row']}>
          <table className={`${styles['inline-table']}`}>
            <thead>
              <tr>{buildTableHead(hTable1)}</tr>
            </thead>
            <tbody>
              <tr>{buildTableBody(hTable1)}</tr>
            </tbody>
          </table>
          <table
            className={`${styles['vertical-table']} ${styles['inline-table']}`}
          >
            <tbody>{buildHorizontalTable(vTable1)}</tbody>
          </table>
          <table
            className={`${styles['vertical-table']} ${styles['inline-table']}`}
          >
            <tbody>{buildHorizontalTable(vTable2)}</tbody>
          </table>
        </div>
      </div>
    );
  }
}

MetricsTable.propTypes = {
  metrics: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  options: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

MetricsTable.defaultProps = {
  metrics: {},
  options: {}
};

export default MetricsTable;
