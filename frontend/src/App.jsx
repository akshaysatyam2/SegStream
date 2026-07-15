/**
 * App.jsx — SegStream Main Application Layout
 *
 * Orchestrates the entire streaming studio UI. On desktop/laptop,
 * renders the full studio layout (preview center, panels on sides,
 * controls bottom). On phone/tablet, renders the MobileViewer
 * component instead — a card-based remote control interface.
 *
 * CRITICAL ARCHITECTURAL NOTES (from .cursorrules):
 * - Hidden <video> elements MUST have .play() called explicitly.
 * - Never pass mutable state into useEffect dependency arrays
 *   for requestAnimationFrame loops — use useRef instead.
 * - Root .app container must have height: 100vh, overflow: hidden.
 * - Theme: pupsn.com colors (Orange #FF9F1C, Teal #2EC4B6).
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
   * Keep refs to the latest values of everything the compositing loop
   * and recording logic need. This avoids stale closures AND avoids
   * putting mutable objects in useEffect dependency arrays.
   */
  const webrtcRef = useRef(webrtc);
  const mediaCaptureRef = useRef(mediaCapture);
  const stateRef = useRef(state);

  // Update refs on every render (cheap, no side effects)
  webrtcRef.current = webrtc;
  mediaCaptureRef.current = mediaCapture;
  stateRef.current = state;

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

  useEffect(() => {
    dispatch({ type: 'SET_MIC_STREAM', payload: mediaCapture.micStream });
  }, [mediaCapture.micStream, dispatch]);

  /**
   * Auto-connect logic.
   * Connects to the backend when we have a webcam stream and are disconnected.
   * Uses a ref-based approach to avoid re-running the effect when webrtc
   * object identity changes.
   */
  useEffect(() => {
    let timer;
    const status = webrtc.connectionStatus;
    if (status === 'disconnected' || status === 'error') {
      timer = setTimeout(() => {
        const currentWebrtc = webrtcRef.current;
        const currentCapture = mediaCaptureRef.current;
        const currentState = stateRef.current;
        currentWebrtc.connect(
          currentCapture.screenStream,
          currentCapture.webcamStream,
          currentState.settings.backendUrl
        );
      }, 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
    // ONLY depend on connectionStatus — not the entire webrtc object
  }, [webrtc.connectionStatus]);

  /**
   * Disconnect and reconnect when streams actually change.
   * Uses ref comparison to detect real stream changes.
   */
  const prevStreamsRef = useRef({
    screen: null,
    webcam: null,
  });

  useEffect(() => {
    const currentScreen = mediaCapture.screenStream;
    const currentWebcam = mediaCapture.webcamStream;

    if (
      prevStreamsRef.current.screen !== currentScreen ||
      prevStreamsRef.current.webcam !== currentWebcam
    ) {
      const status = webrtcRef.current.connectionStatus;
      if (status === 'connected' || status === 'connecting') {
        webrtcRef.current.disconnect();
      }
      prevStreamsRef.current = { screen: currentScreen, webcam: currentWebcam };
    }
  }, [mediaCapture.screenStream, mediaCapture.webcamStream]);

  /**
   * DO NOT auto-stop recording when connection drops.
   * Recording is LOCAL (MediaRecorder on the canvas stream) and does NOT
   * depend on the WebSocket connection. The segmented overlay will just
   * freeze until reconnection — but the screen capture continues.
   *
   * Previously this was: if (status !== 'connected' && isRecording) stop()
   * That caused recordings to auto-stop on brief disconnects.
   */

  /**
   * Local frontend compositing loop.
   * Draws screen stream and segmented webcam to a hidden canvas for recording.
   *
   * CRITICAL: This useEffect should run ONCE and never re-run.
   * All mutable data (state, webrtc, overlay, padding) is read from refs.
   */
  const masterCanvasRef = useRef(null);
  const screenVideoRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    if (!masterCanvasRef.current) {
      masterCanvasRef.current = document.createElement('canvas');
    }
    const canvas = masterCanvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!screenVideoRef.current) {
      screenVideoRef.current = document.createElement('video');
      screenVideoRef.current.autoplay = true;
      screenVideoRef.current.playsInline = true;
      screenVideoRef.current.muted = true;
    }

    let isCompositing = true;

    const loop = () => {
      if (!isCompositing) return;

      const currentState = stateRef.current;
      const currentWebrtc = webrtcRef.current;
      const screenVideo = screenVideoRef.current;

      // Sync video srcObject if screen stream changed
      if (screenVideo.srcObject !== currentState.screenStream) {
        screenVideo.srcObject = currentState.screenStream || null;
        if (currentState.screenStream) {
          screenVideo.play().catch(e => console.error("Screen video play failed", e));
        }
      }

      const padTop = currentState.settings.padding?.top || 0;
      const padBottom = currentState.settings.padding?.bottom || 0;
      const padLeft = currentState.settings.padding?.left || 0;
      const padRight = currentState.settings.padding?.right || 0;

      if (screenVideo.readyState >= 2) {
        // Expand canvas to include padding
        const targetW = screenVideo.videoWidth + padLeft + padRight;
        const targetH = screenVideo.videoHeight + padTop + padBottom;

        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;

        // Fill padding area with a dark background
        if (padTop > 0 || padBottom > 0 || padLeft > 0 || padRight > 0) {
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw screen recording, offset by padding
        ctx.drawImage(screenVideo, padLeft, padTop, screenVideo.videoWidth, screenVideo.videoHeight);

        // Draw segmented webcam overlay if available
        const segBitmap = currentWebrtc.segmentedImgRef?.current;
        if (segBitmap && segBitmap.width > 0 && segBitmap.height > 0) {
          const overlay = currentState.overlay;

          // Map overlay UI coordinates to native canvas coordinates
          let mappedX = overlay.x;
          let mappedY = overlay.y;
          let mappedW = overlay.width;
          let mappedH = overlay.height;

          if (currentState.previewRect) {
            const uiW = currentState.previewRect.width;
            const uiH = currentState.previewRect.height;
            const vidW = canvas.width;
            const vidH = canvas.height;

            if (uiW > 0 && uiH > 0 && vidW > 0 && vidH > 0) {
              const uiRatio = uiW / uiH;
              const vidRatio = vidW / vidH;

              let uiRenderW, uiRenderH, uiRenderX, uiRenderY;

              if (uiRatio > vidRatio) {
                uiRenderH = uiH;
                uiRenderW = uiH * vidRatio;
                uiRenderX = (uiW - uiRenderW) / 2;
                uiRenderY = 0;
              } else {
                uiRenderW = uiW;
                uiRenderH = uiW / vidRatio;
                uiRenderX = 0;
                uiRenderY = (uiH - uiRenderH) / 2;
              }

              const scale = vidW / uiRenderW;
              mappedX = (overlay.x - uiRenderX) * scale;
              mappedY = (overlay.y - uiRenderY) * scale;
              mappedW = overlay.width * scale;
              mappedH = overlay.height * scale;
            }
          }

          /**
           * Draw the segmented person image with object-fit: contain logic.
           * This prevents face cutting by fitting the entire image within
           * the overlay bounds while maintaining aspect ratio.
           */
          const drawContain = (img, x, y, w, h) => {
            const imgW = img.width;
            const imgH = img.height;
            if (!imgW || !imgH) return;

            const imgRatio = imgW / imgH;
            const boxRatio = w / h;

            let renderW, renderH, offsetX, offsetY;
            if (imgRatio > boxRatio) {
              renderW = w;
              renderH = w / imgRatio;
              offsetX = 0;
              offsetY = (h - renderH) / 2;
            } else {
              renderH = h;
              renderW = h * imgRatio;
              offsetX = (w - renderW) / 2;
              offsetY = 0;
            }
            ctx.drawImage(img, x + offsetX, y + offsetY, renderW, renderH);
          };

          ctx.globalAlpha = overlay.opacity;

          if (overlay.shape === 'circle') {
            ctx.save();
            ctx.beginPath();
            ctx.arc(mappedX + mappedW / 2, mappedY + mappedH / 2, Math.min(mappedW, mappedH) / 2, 0, Math.PI * 2);
            ctx.clip();
            drawContain(segBitmap, mappedX, mappedY, mappedW, mappedH);
            ctx.restore();
          } else if (overlay.shape === 'rounded') {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(mappedX, mappedY, mappedW, mappedH, 16);
            ctx.clip();
            drawContain(segBitmap, mappedX, mappedY, mappedW, mappedH);
            ctx.restore();
          } else {
            drawContain(segBitmap, mappedX, mappedY, mappedW, mappedH);
          }
          ctx.globalAlpha = 1.0;
        }
      }

      setTimeout(loop, 33); // ~30 FPS, works even in background tabs
    };

    setTimeout(loop, 33);

    return () => {
      isCompositing = false;
    };
    // EMPTY dependency array — runs ONCE, reads everything from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle local recording using MediaRecorder and the master canvas stream.
   *
   * Audio pipeline: Use Web Audio API to mix all available audio sources
   * (screen system audio + microphone) with independent gain control.
   * The mixed audio is added to the canvas stream for recording.
   */
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const audioNodesRef = useRef([]); // Track audio nodes to prevent GC

  useEffect(() => {
    if (state.isRecording && !mediaRecorderRef.current) {
      const canvas = masterCanvasRef.current;
      if (!canvas) return;

      const stream = canvas.captureStream(30); // 30 FPS

      // --- Audio Mixing with Gain Control ---
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000, // Match common sample rate to prevent artifacts
      });
      audioCtxRef.current = audioCtx;
      const audioDest = audioCtx.createMediaStreamDestination();
      const audioNodes = [];
      let hasAudio = false;

      // Helper to connect an audio source with gain control
      const connectAudioSource = (mediaStream, gainValue) => {
        if (!mediaStream || mediaStream.getAudioTracks().length === 0) return;
        try {
          const source = audioCtx.createMediaStreamSource(mediaStream);
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = gainValue;
          source.connect(gainNode);
          gainNode.connect(audioDest);
          audioNodes.push(source, gainNode); // Keep references to prevent GC
          hasAudio = true;
        } catch (e) {
          console.warn('[App] Failed to connect audio source:', e);
        }
      };

      // Screen system audio — full volume
      connectAudioSource(state.screenStream, 1.0);

      // Webcam audio (if any) — moderate volume
      connectAudioSource(state.webcamStream, 0.8);

      // Standalone microphone — boosted volume for narration
      connectAudioSource(state.micStream, 1.5);

      audioNodesRef.current = audioNodes;

      if (hasAudio) {
        audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      }

      let recorder;
      try {
        // Prefer VP9 for better quality
        const options = {
          mimeType: 'video/webm; codecs=vp9,opus',
          videoBitsPerSecond: 5000000, // 5 Mbps for quality
          audioBitsPerSecond: 128000,  // 128 kbps audio
        };
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        console.warn('VP9+Opus not supported, trying VP8', e);
        try {
          recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm; codecs=vp8,opus',
            videoBitsPerSecond: 5000000,
            audioBitsPerSecond: 128000,
          });
        } catch (e2) {
          try {
            recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          } catch (e3) {
            recorder = new MediaRecorder(stream);
          }
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (recordedChunksRef.current.length === 0) return;
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        recordedChunksRef.current = [];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = `segstream_${Date.now()}.webm`;
        a.click();
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);
      };

      // Use 500ms timeslice for smoother audio (1000ms was causing breaks)
      recorder.start(500);
      mediaRecorderRef.current = recorder;

    } else if (!state.isRecording && mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.warn('[App] Error stopping recorder:', e);
      }

      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }

      audioNodesRef.current = [];
      mediaRecorderRef.current = null;
    }
  }, [state.isRecording, state.screenStream, state.webcamStream, state.micStream]);

  /**
   * Sync webcam overlay position, size, and shape to the backend.
   * This ensures the AI composited video matches the frontend preview.
   *
   * Debounce the fetch to prevent spamming the backend on every slider tick.
   */
  const configSyncTimerRef = useRef(null);
  useEffect(() => {
    if (configSyncTimerRef.current) {
      clearTimeout(configSyncTimerRef.current);
    }
    configSyncTimerRef.current = setTimeout(() => {
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
    }, 300); // 300ms debounce

    return () => {
      if (configSyncTimerRef.current) {
        clearTimeout(configSyncTimerRef.current);
      }
    };
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
              <RecordingControls webrtc={webrtc} />
              <DeviceSelector
                mediaCapture={mediaCapture}
              />
              <OverlayControl />
            </aside>

            {/* Center — the main event: live stream preview */}
            <section className="studio-layout__preview">
              <StreamPreview webrtc={webrtc} />
            </section>

            {/* Right panel — output and streaming settings */}
            <aside className="studio-layout__sidebar studio-layout__sidebar--right">
              <StreamSettings webrtc={webrtc} />
            </aside>
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
