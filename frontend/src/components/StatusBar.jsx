/**
 * StatusBar.jsx — Bottom Status Bar
 *
 * Displays real-time streaming statistics at the bottom of the
 * viewport: FPS, latency (ms), bitrate (kbps), and connection
 * status. Reads all data from StreamContext.
 *
 * @author Akshay Satyam
 */

import { memo } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import './StatusBar.css';

/**
 * Format bitrate for display.
 * Shows Mbps for values >= 1000 kbps, otherwise kbps.
 */
function formatBitrate(kbps) {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${kbps} kbps`;
}

function StatusBar() {
  const { state } = useStream();
  const { stats, connectionStatus, isRecording } = state;

  return (
    <footer className="status-bar">
      {/* Left: Connection + Recording status */}
      <div className="status-bar__section">
        <span className={`status-bar__indicator status-bar__indicator--${connectionStatus}`} />
        <span className="status-bar__text">
          {connectionStatus === 'connected' ? 'Live' : connectionStatus}
        </span>
        {isRecording && (
          <span className="status-bar__recording">
            <span className="status-bar__recording-dot" />
            REC
          </span>
        )}
      </div>

      {/* Center: Stats */}
      <div className="status-bar__section status-bar__stats">
        <div className="status-bar__stat">
          <span className="status-bar__stat-label">FPS</span>
          <span className="status-bar__stat-value">{stats.fps || '—'}</span>
        </div>
        <div className="status-bar__stat-divider" />
        <div className="status-bar__stat">
          <span className="status-bar__stat-label">Latency</span>
          <span className="status-bar__stat-value">
            {stats.latency > 0 ? `${stats.latency}ms` : '—'}
          </span>
        </div>
        <div className="status-bar__stat-divider" />
        <div className="status-bar__stat">
          <span className="status-bar__stat-label">Bitrate</span>
          <span className="status-bar__stat-value">
            {stats.bitrate > 0 ? formatBitrate(stats.bitrate) : '—'}
          </span>
        </div>
      </div>

      {/* Right: Provider info */}
      <div className="status-bar__section">
        <span className="status-bar__provider">
          SegStream v1.0
        </span>
      </div>
    </footer>
  );
}

export default memo(StatusBar);
