/**
 * App.jsx — SegStream Main Application Layout
 *
 * Orchestrates the entire streaming studio UI. On desktop/laptop,
 * renders the full studio layout (preview center, panels on sides,
 * controls bottom). On phone/tablet, renders the MobileViewer
 * component instead — a card-based remote control interface.
 *
 * Layout strategy:
 *   - Desktop (>1024px): CSS Grid — 3 columns (sidebar | preview | sidebar), controls bottom
 *   - Tablet (640-1024px): 2 columns via MobileViewer
 *   - Phone (<640px): Single column via MobileViewer
 *
 * @author Akshay Satyam
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStream } from './context/StreamContext.jsx';
import { useTheme } from './hooks/useTheme.js';
import { useMediaCapture } from './hooks/useMediaCapture.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { BREAKPOINTS } from './utils/constants.js';

/* Components */
import Header from './components/Header.jsx';
import StreamPreview from './components/StreamPreview.jsx';
import OverlayControl from './components/OverlayControl.jsx';
import RecordingControls from './components/RecordingControls.jsx';
import StreamSettings from './components/StreamSettings.jsx';
import DeviceSelector from './components/DeviceSelector.jsx';
import StatusBar from './components/StatusBar.jsx';
import MobileViewer from './components/MobileViewer.jsx';

import './App.css';

/**
 * Determines if the current viewport is a "desktop" layout.
 * Desktop layout kicks in at 1024px — anything below gets the
 * mobile/tablet viewer instead.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.innerWidth >= BREAKPOINTS.laptop
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${BREAKPOINTS.laptop}px)`);

    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export default function App() {
  const isDesktop = useIsDesktop();
  const { state, dispatch } = useStream();
  const theme = useTheme();

  /**
   * Initialize media capture and WebRTC hooks.
   * These manage their own lifecycle and sync state
   * back into StreamContext via dispatch.
   */
  const mediaCapture = useMediaCapture(dispatch);
  const webrtc = useWebRTC(dispatch);

  /**
   * Sync WebRTC connection status into the global context
   * whenever it changes, so all components can react to it.
   */
  useEffect(() => {
    dispatch({
      type: 'SET_CONNECTION_STATUS',
      payload: webrtc.connectionStatus,
    });
  }, [webrtc.connectionStatus, dispatch]);

  /**
   * Sync WebRTC stats into global context for the StatusBar
   * to display FPS, latency, and bitrate.
   */
  useEffect(() => {
    if (webrtc.stats) {
      dispatch({ type: 'UPDATE_STATS', payload: webrtc.stats });
    }
  }, [webrtc.stats, dispatch]);

  /**
   * Pass screen/webcam streams into context when they change.
   * The preview and overlay components read from context.
   */
  useEffect(() => {
    dispatch({ type: 'SET_SCREEN_STREAM', payload: mediaCapture.screenStream });
  }, [mediaCapture.screenStream, dispatch]);

  useEffect(() => {
    dispatch({ type: 'SET_WEBCAM_STREAM', payload: mediaCapture.webcamStream });
  }, [mediaCapture.webcamStream, dispatch]);

  /**
   * Auto-connect and auto-reconnect logic.
   * If disconnected or error, retry connection after 2 seconds.
   */
  useEffect(() => {
    let timer;
    if (webrtc.connectionStatus === 'disconnected' || webrtc.connectionStatus === 'error') {
      timer = setTimeout(() => {
        webrtc.connect(mediaCapture.screenStream, mediaCapture.webcamStream, state.settings.backendUrl);
      }, 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [webrtc.connectionStatus, webrtc, mediaCapture.screenStream, mediaCapture.webcamStream, state.settings.backendUrl]);

  /**
   * Disconnect when streams change to force a renegotiation via auto-reconnect.
   */
  const prevStreamsRef = useRef({ screen: mediaCapture.screenStream, webcam: mediaCapture.webcamStream });
  useEffect(() => {
    if (
      prevStreamsRef.current.screen !== mediaCapture.screenStream ||
      prevStreamsRef.current.webcam !== mediaCapture.webcamStream
    ) {
      if (webrtc.connectionStatus === 'connected' || webrtc.connectionStatus === 'connecting') {
        webrtc.disconnect();
      }
      prevStreamsRef.current = { screen: mediaCapture.screenStream, webcam: mediaCapture.webcamStream };
    }
  }, [mediaCapture.screenStream, mediaCapture.webcamStream, webrtc]);

  /**
   * Auto-stop recording if connection is lost.
   */
  useEffect(() => {
    if (webrtc.connectionStatus !== 'connected' && state.isRecording) {
      dispatch({ type: 'SET_RECORDING', payload: false });
    }
  }, [webrtc.connectionStatus, state.isRecording, dispatch]);

  /**
   * Trigger backend recording APIs when state.isRecording toggles.
   * Alerts the user with the saved file path upon stopping.
   */
  const prevIsRecording = useRef(state.isRecording);
  useEffect(() => {
    if (state.isRecording && !prevIsRecording.current) {
      // Started recording
      fetch(`${state.settings.backendUrl}/api/recording/start`, { method: 'POST' })
        .catch(err => console.error('[App] Failed to start recording:', err));
    } else if (!state.isRecording && prevIsRecording.current) {
      // Stopped recording
      fetch(`${state.settings.backendUrl}/api/recording/stop`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.path) {
            alert(`Recording successfully saved to:\n${data.path}`);
          }
        })
        .catch(err => console.error('[App] Failed to stop recording:', err));
    }
    prevIsRecording.current = state.isRecording;
  }, [state.isRecording, state.settings.backendUrl]);

  /**
   * Sync webcam overlay position, size, and shape to the backend.
   * This ensures the AI composited video matches the frontend preview.
   */
  useEffect(() => {
    fetch(`${state.settings.backendUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overlay_x: state.overlay.x,
        overlay_y: state.overlay.y,
        overlay_width: state.overlay.width,
        overlay_height: state.overlay.height,
        overlay_opacity: state.overlay.opacity,
        overlay_shape: state.overlay.shape,
      }),
    }).catch(err => console.error('[App] Failed to sync overlay config:', err));
  }, [state.overlay, state.settings.backendUrl]);

  return (
    <div className="app">
      {/* Top navigation bar — always visible */}
      <Header theme={theme} connectionStatus={state.connectionStatus} />

      <main className="app__main">
        {isDesktop ? (
          /**
           * DESKTOP / LAPTOP LAYOUT
           * Full streaming studio with 3-panel grid:
           *   Left sidebar: Device selector + Overlay controls
           *   Center: Main stream preview (large)
           *   Right sidebar: Stream settings
           *   Bottom: Recording controls (full width)
           */
          <div className="studio-layout">
            {/* Left panel — source selection and overlay positioning */}
            <aside className="studio-layout__sidebar studio-layout__sidebar--left">
              <DeviceSelector
                mediaCapture={mediaCapture}
              />
              <OverlayControl />
            </aside>

            {/* Center — the main event: live stream preview */}
            <section className="studio-layout__preview">
              <StreamPreview />
            </section>

            {/* Right panel — output and streaming settings */}
            <aside className="studio-layout__sidebar studio-layout__sidebar--right">
              <StreamSettings webrtc={webrtc} />
            </aside>

            {/* Bottom — recording controls span full width */}
            <div className="studio-layout__controls">
              <RecordingControls webrtc={webrtc} />
            </div>
          </div>
        ) : (
          /**
           * MOBILE / TABLET LAYOUT
           * Card-based vertical stack optimized for touch.
           * Screen capture doesn't work on mobile — the phone
           * acts as a monitor and remote control.
           */
          <MobileViewer
            mediaCapture={mediaCapture}
            webrtc={webrtc}
          />
        )}
      </main>

      {/* Bottom status bar — FPS, latency, connection info */}
      <StatusBar />
    </div>
  );
}
