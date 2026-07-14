/**
 * RecordingControls.jsx — Recording & Connection Controls
 *
 * Bottom control bar with:
 *   - Start/Stop recording button with pulsing red dot when active
 *   - Recording timer display
 *   - Format selector dropdown
 *   - Connect/Disconnect WebRTC button
 *
 * Props:
 *   webrtc — { connectionStatus, connect, disconnect } from useWebRTC()
 *
 * @author Akshay Satyam
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import { RECORDING_FORMATS } from '../utils/constants.js';
import './RecordingControls.css';

/**
 * Format seconds into MM:SS display string.
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function RecordingControls({ webrtc }) {
  const { state, dispatch } = useStream();
  const { isRecording, screenStream, webcamStream, settings } = state;
  const { connectionStatus, connect, disconnect } = webrtc;

  /* Timer state for recording duration */
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef(null);

  /* ============================================================
     RECORDING TIMER
     Starts/stops a 1-second interval to track recording duration.
     ============================================================ */
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  /* ============================================================
     HANDLERS
     ============================================================ */

  /** Toggle recording on/off */
  const handleRecordToggle = useCallback(() => {
    dispatch({ type: 'TOGGLE_RECORDING' });
  }, [dispatch]);

  /** Connect to the backend via WebRTC */
  const handleConnect = useCallback(() => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
      disconnect();
    } else {
      connect(screenStream, webcamStream, settings.backendUrl);
    }
  }, [connectionStatus, connect, disconnect, screenStream, webcamStream, settings.backendUrl]);

  /** Handle format change */
  const handleFormatChange = useCallback(
    (e) => {
      dispatch({ type: 'SET_FORMAT', payload: e.target.value });
    },
    [dispatch]
  );

  /* Determine button states */
  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="recording-controls">
      {/* --- Record Button --- */}
      <div className="recording-controls__section">
        <button
          className={`recording-controls__record-btn ${
            isRecording ? 'recording-controls__record-btn--active' : ''
          }`}
          onClick={handleRecordToggle}
          disabled={!isConnected}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          <span className="recording-controls__record-dot" />
          <span className="recording-controls__record-label">
            {isRecording ? 'Stop' : 'Record'}
          </span>
        </button>

        {/* Recording timer */}
        {isRecording && (
          <span className="recording-controls__timer">
            {formatTime(recordingTime)}
          </span>
        )}
      </div>

      {/* --- Format Selector --- */}
      <div className="recording-controls__section">
        <label className="recording-controls__format-label">Format</label>
        <select
          className="recording-controls__format-select"
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

      {/* --- Connect/Disconnect Button --- */}
      <div className="recording-controls__section">
        <button
          className={`recording-controls__connect-btn ${
            isConnected
              ? 'recording-controls__connect-btn--connected'
              : isConnecting
                ? 'recording-controls__connect-btn--connecting'
                : ''
          }`}
          disabled={true}
          style={{ cursor: 'default' }}
        >
          {/* Connection icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isConnected ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </>
            )}
          </svg>
          <span>
            {isConnected
              ? 'Connected (Auto)'
              : isConnecting
                ? 'Connecting…'
                : 'Disconnected'}
          </span>
        </button>
      </div>
    </div>
  );
}

export default memo(RecordingControls);
