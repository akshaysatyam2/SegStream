/**
 * FloatingRecordButton.jsx — Floating Action Button for Recording
 *
 * A persistent floating button in the bottom-right corner that allows
 * users to start/stop recording at any time. Shows a pulsing red dot
 * and elapsed time when recording is active.
 *
 * @author Akshay Satyam
 */

import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import './FloatingRecordButton.css';

/**
 * Format seconds into HH:MM:SS or MM:SS display string.
 */
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function FloatingRecordButton() {
  const { state, dispatch } = useStream();
  const { isRecording } = state;

  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef(null);

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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handleToggle = useCallback(() => {
    dispatch({ type: 'TOGGLE_RECORDING' });
  }, [dispatch]);

  return (
    <div className={`fab-record ${isRecording ? 'fab-record--active' : ''}`}>
      {/* Timer display when recording */}
      {isRecording && (
        <div className="fab-record__timer">
          <span className="fab-record__timer-dot" />
          <span className="fab-record__timer-text">{formatTime(recordingTime)}</span>
        </div>
      )}

      {/* Main FAB button */}
      <button
        className="fab-record__btn"
        onClick={handleToggle}
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
      >
        {isRecording ? (
          /* Stop icon — rounded square */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          /* Record icon — filled circle */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="8" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default memo(FloatingRecordButton);
