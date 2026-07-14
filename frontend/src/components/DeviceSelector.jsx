/**
 * DeviceSelector.jsx — Left Sidebar Device Selection Panel
 *
 * Lists available video/audio input devices and provides controls
 * to start screen capture and webcam. Webcam picker dropdown lets
 * users switch between multiple cameras.
 *
 * Props:
 *   mediaCapture — The full object returned by useMediaCapture()
 *
 * @author Akshay Satyam
 */

import { memo, useCallback, useMemo } from 'react';
import './DeviceSelector.css';

function DeviceSelector({ mediaCapture }) {
  const {
    screenStream,
    webcamStream,
    startScreenCapture,
    startWebcam,
    stopScreenCapture,
    stopWebcam,
    availableDevices,
    selectedDevices,
    selectDevice,
  } = mediaCapture;

  /* ============================================================
     FILTER DEVICES BY KIND
     Separate video inputs (cameras) and audio inputs (mics)
     from the full device list.
     ============================================================ */
  const videoInputs = useMemo(
    () => availableDevices.filter((d) => d.kind === 'videoinput'),
    [availableDevices]
  );

  const audioInputs = useMemo(
    () => availableDevices.filter((d) => d.kind === 'audioinput'),
    [availableDevices]
  );

  /* ============================================================
     HANDLERS
     ============================================================ */

  /** Toggle screen capture on/off */
  const handleScreenToggle = useCallback(() => {
    if (screenStream) {
      stopScreenCapture();
    } else {
      startScreenCapture();
    }
  }, [screenStream, startScreenCapture, stopScreenCapture]);

  /** Toggle webcam on/off */
  const handleWebcamToggle = useCallback(() => {
    if (webcamStream) {
      stopWebcam();
    } else {
      startWebcam();
    }
  }, [webcamStream, startWebcam, stopWebcam]);

  /** Handle camera device selection change */
  const handleVideoDeviceChange = useCallback(
    (e) => {
      selectDevice('videoinput', e.target.value);
    },
    [selectDevice]
  );

  /** Handle microphone device selection change */
  const handleAudioDeviceChange = useCallback(
    (e) => {
      selectDevice('audioinput', e.target.value);
    },
    [selectDevice]
  );

  return (
    <div className="device-selector">
      {/* Panel header */}
      <div className="device-selector__header">
        <h3 className="device-selector__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Sources
        </h3>
      </div>

      {/* --- Screen Capture --- */}
      <div className="device-selector__section">
        <label className="device-selector__label">Screen Capture</label>
        <button
          className={`device-selector__capture-btn ${
            screenStream ? 'device-selector__capture-btn--active' : ''
          }`}
          onClick={handleScreenToggle}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {screenStream ? (
              /* Stop icon */
              <rect x="6" y="6" width="12" height="12" rx="1" />
            ) : (
              /* Monitor icon */
              <>
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </>
            )}
          </svg>
          <span>{screenStream ? 'Stop Screen' : 'Start Screen Capture'}</span>
        </button>
      </div>

      {/* --- Webcam --- */}
      <div className="device-selector__section">
        <label className="device-selector__label">Webcam</label>

        {/* Camera device picker (only visible when there are multiple cameras) */}
        {videoInputs.length > 0 && (
          <select
            className="device-selector__select"
            value={selectedDevices.videoInput}
            onChange={handleVideoDeviceChange}
          >
            {videoInputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}

        <button
          className={`device-selector__capture-btn ${
            webcamStream ? 'device-selector__capture-btn--active' : ''
          }`}
          onClick={handleWebcamToggle}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {webcamStream ? (
              /* Stop icon */
              <rect x="6" y="6" width="12" height="12" rx="1" />
            ) : (
              /* Camera icon */
              <>
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </>
            )}
          </svg>
          <span>{webcamStream ? 'Stop Webcam' : 'Start Webcam'}</span>
        </button>
      </div>

      {/* --- Microphone --- */}
      <div className="device-selector__section">
        <label className="device-selector__label">Microphone</label>
        {audioInputs.length > 0 ? (
          <select
            className="device-selector__select"
            value={selectedDevices.audioInput}
            onChange={handleAudioDeviceChange}
          >
            {audioInputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
        ) : (
          <p className="device-selector__empty">
            No microphones detected
          </p>
        )}

        <button
          className={`device-selector__capture-btn ${
            mediaCapture.micStream ? 'device-selector__capture-btn--active' : ''
          }`}
          onClick={() => mediaCapture.micStream ? mediaCapture.stopMic() : mediaCapture.startMic()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mediaCapture.micStream ? (
              <rect x="6" y="6" width="12" height="12" rx="1" />
            ) : (
              <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </>
            )}
          </svg>
          <span>{mediaCapture.micStream ? 'Stop Microphone' : 'Start Microphone'}</span>
        </button>
      </div>

      {/* --- Device count summary --- */}
      <div className="device-selector__summary">
        <span>{videoInputs.length} camera{videoInputs.length !== 1 ? 's' : ''}</span>
        <span className="device-selector__summary-dot">·</span>
        <span>{audioInputs.length} mic{audioInputs.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

export default memo(DeviceSelector);
