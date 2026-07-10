/**
 * OverlayControl.jsx — Webcam Overlay Control Panel
 *
 * Provides sliders and selectors for adjusting the webcam overlay's
 * position, size, opacity, and shape. Reads and writes overlay state
 * from/to the StreamContext.
 *
 * Controls:
 *   - X/Y position sliders
 *   - Width/Height sliders
 *   - Opacity slider
 *   - Shape selector (rectangle / circle / rounded)
 *   - Reset button to restore defaults
 *
 * @author Akshay Satyam
 */

import { memo, useCallback } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import './OverlayControl.css';

/** Available overlay shape options */
const SHAPES = [
  { value: 'rectangle', label: 'Rectangle', icon: '▬' },
  { value: 'rounded', label: 'Rounded', icon: '▢' },
  { value: 'circle', label: 'Circle', icon: '●' },
];

function OverlayControl() {
  const { state, dispatch } = useStream();
  const { overlay, webcamStream } = state;

  /**
   * Generic handler for slider changes.
   * Creates a dispatch call that updates the specified overlay property.
   */
  const handleSliderChange = useCallback(
    (property) => (e) => {
      dispatch({
        type: 'SET_OVERLAY',
        payload: { [property]: Number(e.target.value) },
      });
    },
    [dispatch]
  );

  /**
   * Handle shape selection.
   */
  const handleShapeChange = useCallback(
    (shape) => {
      dispatch({
        type: 'SET_OVERLAY',
        payload: { shape },
      });
    },
    [dispatch]
  );

  /**
   * Reset overlay to default values.
   */
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_OVERLAY' });
  }, [dispatch]);

  return (
    <div className="overlay-control">
      {/* Panel header */}
      <div className="overlay-control__header">
        <h3 className="overlay-control__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
          Overlay Controls
        </h3>
        <button
          className="overlay-control__reset"
          onClick={handleReset}
          title="Reset overlay to defaults"
        >
          Reset
        </button>
      </div>

      {/* Show a hint when no webcam is active */}
      {!webcamStream && (
        <div className="overlay-control__hint">
          Start webcam to see overlay controls in action.
        </div>
      )}

      {/* Position sliders */}
      <div className="overlay-control__group">
        <label className="overlay-control__label">
          Position X
          <span className="overlay-control__value">{overlay.x}px</span>
        </label>
        <input
          type="range"
          className="overlay-control__slider"
          min="0"
          max="1600"
          value={overlay.x}
          onChange={handleSliderChange('x')}
        />
      </div>

      <div className="overlay-control__group">
        <label className="overlay-control__label">
          Position Y
          <span className="overlay-control__value">{overlay.y}px</span>
        </label>
        <input
          type="range"
          className="overlay-control__slider"
          min="0"
          max="900"
          value={overlay.y}
          onChange={handleSliderChange('y')}
        />
      </div>

      {/* Size sliders */}
      <div className="overlay-control__group">
        <label className="overlay-control__label">
          Width
          <span className="overlay-control__value">{overlay.width}px</span>
        </label>
        <input
          type="range"
          className="overlay-control__slider"
          min="80"
          max="640"
          value={overlay.width}
          onChange={handleSliderChange('width')}
        />
      </div>

      <div className="overlay-control__group">
        <label className="overlay-control__label">
          Height
          <span className="overlay-control__value">{overlay.height}px</span>
        </label>
        <input
          type="range"
          className="overlay-control__slider"
          min="60"
          max="480"
          value={overlay.height}
          onChange={handleSliderChange('height')}
        />
      </div>

      {/* Opacity slider */}
      <div className="overlay-control__group">
        <label className="overlay-control__label">
          Opacity
          <span className="overlay-control__value">
            {Math.round(overlay.opacity * 100)}%
          </span>
        </label>
        <input
          type="range"
          className="overlay-control__slider"
          min="0"
          max="1"
          step="0.05"
          value={overlay.opacity}
          onChange={handleSliderChange('opacity')}
        />
      </div>

      {/* Shape selector */}
      <div className="overlay-control__group">
        <label className="overlay-control__label">Shape</label>
        <div className="overlay-control__shapes">
          {SHAPES.map(({ value, label, icon }) => (
            <button
              key={value}
              className={`overlay-control__shape-btn ${
                overlay.shape === value ? 'overlay-control__shape-btn--active' : ''
              }`}
              onClick={() => handleShapeChange(value)}
              title={label}
            >
              <span className="overlay-control__shape-icon">{icon}</span>
              <span className="overlay-control__shape-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(OverlayControl);
