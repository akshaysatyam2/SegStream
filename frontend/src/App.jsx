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

  useEffect(() => {
    dispatch({ type: 'SET_MIC_STREAM', payload: mediaCapture.micStream });
  }, [mediaCapture.micStream, dispatch]);

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
   * Local frontend compositing loop.
   * Draws screen stream and segmented webcam to a hidden canvas for recording.
   */
  const masterCanvasRef = useRef(null);
  const screenVideoRef = useRef(null);

  // Keep latest state in refs so the loop can read them without stale closures or dependency re-renders
  const latestStateRef = useRef(state);
  const audioCtxRef = useRef(null);
  const latestWebrtcRef = useRef(webrtc);
  useEffect(() => {
    latestStateRef.current = state;
    latestWebrtcRef.current = webrtc;
  }, [state, webrtc]);

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
    const screenVideo = screenVideoRef.current;
    
    if (screenVideo.srcObject !== state.screenStream) {
      screenVideo.srcObject = state.screenStream || null;
      if (state.screenStream) {
        screenVideo.play().catch(e => console.error("Screen video play failed", e));
      }
    }

    let isCompositing = true;
    const loop = () => {
      if (!isCompositing) return;
      const currentState = latestStateRef.current;
      const currentWebrtc = latestWebrtcRef.current;

      const padTop = currentState.settings.padding.top || 0;
      const padBottom = currentState.settings.padding.bottom || 0;
      const padLeft = currentState.settings.padding.left || 0;
      const padRight = currentState.settings.padding.right || 0;

      if (screenVideo.readyState >= 2) {
        // Expand canvas width/height to add padding space on all sides
        canvas.width = screenVideo.videoWidth + padLeft + padRight;
        canvas.height = screenVideo.videoHeight + padTop + padBottom;
        
        // Fill background black for the padded area
        if (padTop > 0 || padBottom > 0 || padLeft > 0 || padRight > 0) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // Draw screen recording, shifted by top and left padding
        ctx.drawImage(screenVideo, padLeft, padTop, screenVideo.videoWidth, screenVideo.videoHeight);

        // Draw segmented webcam overlay if available
        if (
          currentWebrtc.segmentedImgRef &&
          currentWebrtc.segmentedImgRef.current &&
          currentWebrtc.segmentedImgRef.current.width > 0
        ) {
          // Render a segmented image using object-fit: contain logic to prevent face cutting
          const drawImageContain = (ctx, img, x, y, w, h) => {
             const imgW = img.width || img.naturalWidth;
             const imgH = img.height || img.naturalHeight;
             if (!imgW || !imgH) return;
             const imgRatio = imgW / imgH;
             const boxRatio = w / h;
             
             let renderW, renderH, offsetX, offsetY;
             // For contain, if image is wider than box, fit width
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

          // Map overlay UI coordinates to native canvas coordinates
          const overlay = currentState.overlay;
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

          ctx.globalAlpha = overlay.opacity;
          // Render based on shape
          if (overlay.shape === 'circle') {
             ctx.save();
             ctx.beginPath();
             ctx.arc(mappedX + mappedW/2, mappedY + mappedH/2, Math.min(mappedW, mappedH)/2, 0, Math.PI * 2);
             ctx.clip();
             drawImageContain(ctx, currentWebrtc.segmentedImgRef.current, mappedX, mappedY, mappedW, mappedH);
             ctx.restore();
          } else if (overlay.shape === 'rounded') {
             ctx.save();
             ctx.beginPath();
             ctx.roundRect(mappedX, mappedY, mappedW, mappedH, 16);
             ctx.clip();
             drawImageContain(ctx, currentWebrtc.segmentedImgRef.current, mappedX, mappedY, mappedW, mappedH);
             ctx.restore();
          } else {
             drawImageContain(ctx, currentWebrtc.segmentedImgRef.current, mappedX, mappedY, mappedW, mappedH);
          }
          ctx.globalAlpha = 1.0;
        }
      }
      setTimeout(loop, 33); // 30 FPS target (prevents background tab freezing)
    };
    setTimeout(loop, 33);

    return () => { 
      isCompositing = false; 
      screenVideo.srcObject = null;
    };
  }, [state.screenStream, state.overlay, webrtc]);

  /**
   * Handle local recording using MediaRecorder and the master canvas stream.
   */
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    if (state.isRecording && !mediaRecorderRef.current) {
      const canvas = masterCanvasRef.current;
      const stream = canvas.captureStream(30); // 30 FPS

      // Mix audio tracks using Web Audio API so both Mic and System Audio are recorded
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const audioDest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      if (state.screenStream && state.screenStream.getAudioTracks().length > 0) {
        const screenSource = audioCtx.createMediaStreamSource(state.screenStream);
        screenSource.connect(audioDest);
        hasAudio = true;
      }
      
      if (state.webcamStream && state.webcamStream.getAudioTracks().length > 0) {
        const webcamSource = audioCtx.createMediaStreamSource(state.webcamStream);
        webcamSource.connect(audioDest);
        hasAudio = true;
      }

      if (state.micStream && state.micStream.getAudioTracks().length > 0) {
        const micSource = audioCtx.createMediaStreamSource(state.micStream);
        micSource.connect(audioDest);
        hasAudio = true;
      }

      if (hasAudio) {
        audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      }

      let recorder;
      try {
        const options = { mimeType: 'video/webm; codecs=vp9' };
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        console.warn('VP9 not supported, falling back to default codecs', e);
        try {
          recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        } catch (e2) {
          recorder = new MediaRecorder(stream);
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        recordedChunksRef.current = [];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = `segstream_${Date.now()}.webm`;
        a.click();
        window.URL.revokeObjectURL(url);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } else if (!state.isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      mediaRecorderRef.current = null;
    }
  }, [state.isRecording, state.screenStream, state.webcamStream, state.micStream]);

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
