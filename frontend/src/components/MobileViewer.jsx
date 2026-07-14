/**
 * MobileViewer.jsx — Mobile/Tablet Layout Component
 *
 * Simplified, touch-optimized layout for screens below 1024px.
 * Uses a vertical card-based stack instead of the desktop 3-panel
 * grid. Screen capture doesn't work on most mobile browsers,
 * so this acts primarily as a remote monitor/control interface.
 *
 * Card stack:
 *   1. Connection card — connect/disconnect to backend
 *   2. Preview card — shows the stream (if connected)
 *   3. Webcam card — start/stop webcam
 *   4. Controls card — basic recording controls
 *
 * Props:
 *   mediaCapture — From useMediaCapture()
 *   webrtc — From useWebRTC()
 *
 * @author Akshay Satyam
 */

import { memo, useCallback, useRef, useEffect } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import './MobileViewer.css';

function MobileViewer({ mediaCapture, webrtc }) {
  const { state, dispatch } = useStream();
  const { connectionStatus, isRecording, webcamStream, screenStream, settings } = state;
  const { connect, disconnect } = webrtc;
  const { startWebcam, stopWebcam, startScreenCapture, stopScreenCapture } = mediaCapture;

  /* Ref for the webcam preview video */
  const webcamVideoRef = useRef(null);
  const screenVideoRef = useRef(null);

  /* Attach webcam stream to video element */
  useEffect(() => {
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = webcamStream || null;
    }
  }, [webcamStream]);

  /* Attach screen stream to video element */
  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream || null;
    }
  }, [screenStream]);

  /* ============================================================
     HANDLERS
     ============================================================ */

  const handleConnect = useCallback(() => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
      disconnect();
    } else {
      connect(screenStream, webcamStream, settings.backendUrl);
    }
  }, [connectionStatus, connect, disconnect, screenStream, webcamStream, settings.backendUrl]);

  const handleWebcamToggle = useCallback(() => {
    if (webcamStream) {
      stopWebcam();
    } else {
      startWebcam();
    }
  }, [webcamStream, startWebcam, stopWebcam]);

  const handleScreenToggle = useCallback(() => {
    if (screenStream) {
      stopScreenCapture();
    } else {
      startScreenCapture();
    }
  }, [screenStream, startScreenCapture, stopScreenCapture]);

  const handleRecordToggle = useCallback(() => {
    dispatch({ type: 'TOGGLE_RECORDING' });
  }, [dispatch]);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="mobile-viewer">
      {/* --- Connection Card --- */}
      <div className="mobile-viewer__card">
        <h3 className="mobile-viewer__card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          Connection
        </h3>

        <div className="mobile-viewer__status">
          <span className={`mobile-viewer__status-dot mobile-viewer__status-dot--${connectionStatus}`} />
          <span className="mobile-viewer__status-text">{connectionStatus}</span>
        </div>

        <button
          className="mobile-viewer__btn mobile-viewer__btn--primary"
          disabled={true}
          style={{ cursor: 'default' }}
        >
          {isConnected ? 'Connected (Auto)' : isConnecting ? 'Connecting…' : 'Disconnected'}
        </button>
      </div>

      {/* --- Preview Card --- */}
      <div className="mobile-viewer__card mobile-viewer__card--preview">
        <h3 className="mobile-viewer__card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Preview
        </h3>

        {screenStream ? (
          <video
            ref={screenVideoRef}
            className="mobile-viewer__video"
            autoPlay
            playsInline
            muted
          />
        ) : (
          <div className="mobile-viewer__placeholder">
            <p>No screen captured. Start screen capture to see preview.</p>
          </div>
        )}
      </div>

      {/* --- Sources Card --- */}
      <div className="mobile-viewer__card">
        <h3 className="mobile-viewer__card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Sources
        </h3>

        <div className="mobile-viewer__buttons">
          <button
            className={`mobile-viewer__btn ${screenStream ? 'mobile-viewer__btn--danger' : 'mobile-viewer__btn--secondary'}`}
            onClick={handleScreenToggle}
          >
            {screenStream ? 'Stop Screen' : 'Screen Capture'}
          </button>

          <button
            className={`mobile-viewer__btn ${webcamStream ? 'mobile-viewer__btn--danger' : 'mobile-viewer__btn--secondary'}`}
            onClick={handleWebcamToggle}
          >
            {webcamStream ? 'Stop Webcam' : 'Start Webcam'}
          </button>
        </div>

        {/* Webcam mini-preview */}
        {webcamStream && (
          <video
            ref={webcamVideoRef}
            className="mobile-viewer__webcam-preview"
            autoPlay
            playsInline
            muted
          />
        )}
      </div>

      {/* --- Recording Card --- */}
      <div className="mobile-viewer__card">
        <h3 className="mobile-viewer__card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Recording
        </h3>

        <button
          className={`mobile-viewer__btn mobile-viewer__btn--record ${isRecording ? 'mobile-viewer__btn--recording' : ''}`}
          onClick={handleRecordToggle}
          disabled={!isConnected}
        >
          {isRecording && <span className="mobile-viewer__rec-dot" />}
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>
    </div>
  );
}

export default memo(MobileViewer);
