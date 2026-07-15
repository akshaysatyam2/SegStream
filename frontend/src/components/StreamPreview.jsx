/**
 * StreamPreview.jsx — Main Stream Preview Component
 *
 * The centerpiece of the studio layout. Shows the screen capture
 * in a <video> element with the webcam overlay rendered as a
 * draggable/resizable <video> on top. When no streams are active,
 * displays a placeholder with instructions.
 *
 * The webcam overlay supports:
 *   - Drag-and-drop repositioning via mouse events
 *   - Dynamic sizing from overlay state in context
 *   - Shape variants (rectangle, circle, rounded)
 *   - Opacity control
 *
 * @author Akshay Satyam
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useStream } from '../context/StreamContext.jsx';
import './StreamPreview.css';

function StreamPreview({ webrtc }) {
  const { state, dispatch } = useStream();
  const { screenStream, webcamStream, overlay } = state;

  /* Refs for video elements */
  const screenVideoRef = useRef(null);
  const webcamVideoRef = useRef(null);
  const webcamImgRef = useRef(null);
  const previewContainerRef = useRef(null);

  /* Drag state — using refs for performance (no re-render during drag) */
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const webrtcRef = useRef(webrtc);

  /* ============================================================
     ATTACH STREAMS TO VIDEO ELEMENTS
     When the MediaStream objects change, attach them to the
     corresponding <video> elements via srcObject.
     ============================================================ */
  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream || null;
    }
  }, [screenStream]);

  useEffect(() => {
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = webcamStream || null;
    }
  }, [webcamStream]);

  /* Loop to paint segmented frames to the UI */
  useEffect(() => {
    let isRunning = true;
    const loop = () => {
      if (!isRunning) return;
      const rtc = webrtcRef.current;
      if (
        rtc &&
        rtc.connectionStatus === 'connected' &&
        rtc.segmentedImgRef &&
        rtc.segmentedImgRef.current &&
        webcamImgRef.current
      ) {
        const canvas = webcamImgRef.current;
        const bitmap = rtc.segmentedImgRef.current;
        if (bitmap.width && bitmap.height) {
          if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
          if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { isRunning = false; };
  }, []);

  /* ============================================================
     TRACK PREVIEW CONTAINER SIZE
     ============================================================ */
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        dispatch({
          type: 'SET_PREVIEW_RECT',
          payload: { width: rect.width, height: rect.height },
        });
      }
    });
    
    observer.observe(container);
    return () => observer.disconnect();
  }, [dispatch]);

  /* ============================================================
     DRAG-AND-DROP FOR WEBCAM OVERLAY
     Mouse event handlers for repositioning the overlay.
     Uses mousemove on the document so dragging continues even
     if the cursor leaves the overlay element.
     ============================================================ */
  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);

      /* Record the initial mouse position and overlay position */
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: overlay.x,
        startY: overlay.y,
      };
    },
    [overlay.x, overlay.y]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;

      const container = previewContainerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const { x: startMouseX, y: startMouseY, startX, startY } = dragStartRef.current;

      /* Calculate delta from drag start */
      const deltaX = e.clientX - startMouseX;
      const deltaY = e.clientY - startMouseY;

      /* Calculate new position, clamped to container bounds */
      const newX = Math.max(
        0,
        Math.min(startX + deltaX, containerRect.width - overlay.width)
      );
      const newY = Math.max(
        0,
        Math.min(startY + deltaY, containerRect.height - overlay.height)
      );

      dispatch({
        type: 'SET_OVERLAY',
        payload: { x: Math.round(newX), y: Math.round(newY) },
      });
    },
    [isDragging, overlay.width, overlay.height, dispatch]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  /* Attach/detach document-level mouse handlers for dragging */
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  /* ============================================================
     OVERLAY SHAPE CLASS
     Maps the shape setting to a CSS modifier class.
     ============================================================ */
  const overlayShapeClass = `preview__overlay--${overlay.shape || 'rounded'}`;

  /* ============================================================
     RENDER
     ============================================================ */
  webrtcRef.current = webrtc;

  const padT = state.settings.padding?.top || 0;
  const padB = state.settings.padding?.bottom || 0;
  const padL = state.settings.padding?.left || 0;
  const padR = state.settings.padding?.right || 0;
  
  // Use a fallback resolution if video is not loaded yet
  const vw = screenVideoRef.current?.videoWidth || 1920;
  const vh = screenVideoRef.current?.videoHeight || 1080;
  
  const totalW = vw + padL + padR;
  const totalH = vh + padT + padB;

  return (
    <div className="preview" ref={previewContainerRef} style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {screenStream ? (
        /* --- Active screen capture with optional padding --- */
        <div style={{ 
          position: 'relative', 
          aspectRatio: `${totalW} / ${totalH}`, 
          maxHeight: '100%', 
          maxWidth: '100%', 
          backgroundColor: 'var(--ss-bg-panel)', // Make padding highly visible
          border: (padT || padB || padL || padR) ? '2px dashed var(--ss-accent)' : 'none',
          margin: 'auto'
        }}>
          <video
            ref={screenVideoRef}
            className="preview__screen"
            autoPlay
            playsInline
            muted
            style={{ 
               position: 'absolute',
               left: `${(padL / totalW) * 100}%`,
               top: `${(padT / totalH) * 100}%`,
               width: `${(vw / totalW) * 100}%`,
               height: `${(vh / totalH) * 100}%`,
               objectFit: 'contain',
               backgroundColor: 'var(--ss-bg-darkest)'
            }}
          />
        </div>
      ) : (
        /* --- Placeholder when no screen is captured --- */
        <div className="preview__placeholder">
          <div className="preview__placeholder-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3 className="preview__placeholder-title">No Screen Captured</h3>
          <p className="preview__placeholder-text">
            Click <strong>"Start Screen Capture"</strong> in the left panel to begin sharing your screen.
          </p>
        </div>
      )}

      {/* --- Webcam overlay (only visible when webcam is active) --- */}
      {webcamStream && (
        <div
          className={`preview__overlay ${overlayShapeClass} ${isDragging ? 'preview__overlay--dragging' : ''}`}
          style={{
            left: `${overlay.x}px`,
            top: `${overlay.y}px`,
            width: `${overlay.width}px`,
            height: `${overlay.height}px`,
            opacity: overlay.opacity,
          }}
          onMouseDown={handleMouseDown}
          title="Drag to reposition webcam overlay"
        >
          {webrtc?.connectionStatus === 'connected' ? (
            <canvas
              ref={webcamImgRef}
              className="preview__overlay-video"
            />
          ) : (
            <video
              ref={webcamVideoRef}
              className="preview__overlay-video"
              autoPlay
              playsInline
              muted
            />
          )}
          {/* Drag handle indicator */}
          <div className="preview__overlay-handle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="8" cy="8" r="2" />
              <circle cx="16" cy="8" r="2" />
              <circle cx="8" cy="16" r="2" />
              <circle cx="16" cy="16" r="2" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(StreamPreview);
