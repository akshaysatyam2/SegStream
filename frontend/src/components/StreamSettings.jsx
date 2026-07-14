/**
 * StreamSettings.jsx — Right Sidebar Settings Panel
 *
 * Provides controls for stream output configuration:
 *   - Resolution dropdown
 *   - Quality slider
 *   - Output format selector
 *   - RTSP re-streaming toggle
 *   - Backend URL input
 *
 * Props:
 *   webrtc — { connectionStatus, connect, disconnect } from useWebRTC()
 *
 * @author Akshay Satyam
 */

import { memo, useCallback } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import { SUPPORTED_RESOLUTIONS, RECORDING_FORMATS } from '../utils/constants.js';
import './StreamSettings.css';

function StreamSettings({ webrtc }) {
  const { state, dispatch } = useStream();
  const { settings } = state;

  /* ============================================================
     HANDLERS
     ============================================================ */

  /** Handle resolution change from dropdown */
  const handleResolutionChange = useCallback(
    (e) => {
      const index = Number(e.target.value);
      const res = SUPPORTED_RESOLUTIONS[index];
      if (res) {
        dispatch({
          type: 'SET_RESOLUTION',
          payload: { width: res.width, height: res.height },
        });
      }
    },
    [dispatch]
  );

  /** Handle quality slider change */
  const handleQualityChange = useCallback(
    (e) => {
      dispatch({ type: 'SET_QUALITY', payload: Number(e.target.value) });
    },
    [dispatch]
  );

  /** Handle format dropdown change */
  const handleFormatChange = useCallback(
    (e) => {
      dispatch({ type: 'SET_FORMAT', payload: e.target.value });
    },
    [dispatch]
  );

  /** Toggle RTSP re-streaming */
  const handleRtspToggle = useCallback(() => {
    dispatch({ type: 'TOGGLE_RTSP' });
  }, [dispatch]);

  /** Handle backend URL change */
  const handleBackendUrlChange = useCallback(
    (e) => {
      dispatch({ type: 'SET_BACKEND_URL', payload: e.target.value });
    },
    [dispatch]
  );

  /**
   * Find the index of the currently selected resolution in the
   * SUPPORTED_RESOLUTIONS array for the dropdown value.
   */
  const currentResIndex = SUPPORTED_RESOLUTIONS.findIndex(
    (r) =>
      r.width === settings.resolution.width &&
      r.height === settings.resolution.height
  );

  return (
    <div className="stream-settings">
      {/* Panel header */}
      <div className="stream-settings__header">
        <h3 className="stream-settings__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Stream Settings
        </h3>
      </div>

      {/* --- Resolution Dropdown --- */}
      <div className="stream-settings__group">
        <label className="stream-settings__label">Resolution</label>
        <select
          className="stream-settings__select"
          value={currentResIndex >= 0 ? currentResIndex : 2}
          onChange={handleResolutionChange}
        >
          {SUPPORTED_RESOLUTIONS.map((res, index) => (
            <option key={res.label} value={index}>
              {res.label}
            </option>
          ))}
        </select>
      </div>

      {/* --- Quality Slider --- */}
      <div className="stream-settings__group">
        <label className="stream-settings__label">
          Quality
          <span className="stream-settings__value">{settings.quality}%</span>
        </label>
        <input
          type="range"
          className="stream-settings__slider"
          min="10"
          max="100"
          step="5"
          value={settings.quality}
          onChange={handleQualityChange}
        />
        <div className="stream-settings__slider-labels">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* --- Output Format --- */}
      <div className="stream-settings__group">
        <label className="stream-settings__label">Output Format</label>
        <select
          className="stream-settings__select"
          value={settings.format}
          onChange={handleFormatChange}
        >
          {RECORDING_FORMATS.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* --- Layout Padding --- */}
      <div className="stream-settings__group">
        <label className="stream-settings__label">
          Sidebar Padding (px)
          <span className="stream-settings__value">{settings.paddingRight || 0}px</span>
        </label>
        <input
          type="range"
          className="stream-settings__slider"
          min="0"
          max="800"
          step="50"
          value={settings.paddingRight || 0}
          onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { paddingRight: Number(e.target.value) } })}
        />
        <div className="stream-settings__slider-labels">
          <span>0px</span>
          <span>800px</span>
        </div>
      </div>

      {/* --- RTSP Toggle --- */}
      <div className="stream-settings__group stream-settings__group--toggle">
        <label className="stream-settings__label">RTSP Re-Stream</label>
        <button
          className={`stream-settings__toggle ${
            settings.rtspEnabled ? 'stream-settings__toggle--active' : ''
          }`}
          onClick={handleRtspToggle}
          role="switch"
          aria-checked={settings.rtspEnabled}
        >
          <span className="stream-settings__toggle-knob" />
        </button>
      </div>

      {/* --- Backend URL --- */}
      <div className="stream-settings__group">
        <label className="stream-settings__label">Backend URL</label>
        <input
          type="url"
          className="stream-settings__input"
          value={settings.backendUrl}
          onChange={handleBackendUrlChange}
          placeholder="http://localhost:8080"
        />
      </div>

      {/* --- Connection Info --- */}
      <div className="stream-settings__info">
        <div className="stream-settings__info-row">
          <span className="stream-settings__info-label">Status</span>
          <span className={`stream-settings__info-value stream-settings__info-value--${webrtc.connectionStatus}`}>
            {webrtc.connectionStatus}
          </span>
        </div>
        <div className="stream-settings__info-row">
          <span className="stream-settings__info-label">Resolution</span>
          <span className="stream-settings__info-value">
            {settings.resolution.width}×{settings.resolution.height}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(StreamSettings);
