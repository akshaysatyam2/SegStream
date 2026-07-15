/**
 * useWebRTC.js — WebSocket Segmentation Connection Hook
 *
 * Sends webcam frames to the backend via WebSocket for AI segmentation.
 * Returns segmented person bitmaps for the frontend compositor to draw
 * onto the master canvas.
 *
 * CRITICAL DESIGN NOTES:
 * - The returned object MUST have a stable identity. If it changes reference
 *   on every render, any useEffect that depends on it will re-run, destroying
 *   animation loops and media elements.
 * - connectionStatus and stats are exposed via refs so consumers can read
 *   latest values without causing re-renders.
 * - Only connectionStatus triggers a state update (for UI indicators), but
 *   the returned hook object itself stays stable via useRef.
 *
 * @author Akshay Satyam
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { BACKEND_URL } from '../utils/constants.js';

export function useWebRTC(dispatch) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [stats, setStats] = useState({ fps: 0, latency: 0, bitrate: 0 });

  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const segmentedImgRef = useRef(null);
  const waitingForResponseRef = useRef(false);
  const isRunningRef = useRef(false);

  // Keep latest connection status in a ref so callbacks can read it
  // without stale closures and without triggering re-renders.
  const connectionStatusRef = useRef('disconnected');

  const disconnect = useCallback(() => {
    isRunningRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connectionStatusRef.current = 'disconnected';
    setConnectionStatus('disconnected');

    // Clean up the old bitmap
    if (segmentedImgRef.current && segmentedImgRef.current.close) {
      segmentedImgRef.current.close();
      segmentedImgRef.current = null;
    }
  }, []);

  const connect = useCallback(
    async (screenStream, webcamStream, backendUrl) => {
      // Prevent connecting if already connected or connecting
      if (connectionStatusRef.current === 'connected' || connectionStatusRef.current === 'connecting') {
        return;
      }

      disconnect();

      const url = backendUrl || BACKEND_URL;
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/segment';
      connectionStatusRef.current = 'connecting';
      setConnectionStatus('connecting');

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          connectionStatusRef.current = 'connected';
          setConnectionStatus('connected');
          isRunningRef.current = true;
          waitingForResponseRef.current = false;

          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
          }
          if (!videoRef.current) {
            videoRef.current = document.createElement('video');
            videoRef.current.autoplay = true;
            videoRef.current.playsInline = true;
            videoRef.current.muted = true;
          }

          if (videoRef.current.srcObject !== webcamStream) {
            videoRef.current.srcObject = webcamStream || null;
            if (webcamStream) {
              videoRef.current.play().catch(e => console.error("Webcam play failed", e));
            }
          }

          const ctx = canvasRef.current.getContext('2d');

          let lastFrameTime = performance.now();
          let frameCount = 0;

          const loop = () => {
            if (!isRunningRef.current) return;

            // Calculate FPS
            const now = performance.now();
            if (now - lastFrameTime >= 1000) {
              setStats({ fps: frameCount, latency: 0, bitrate: 0 });
              frameCount = 0;
              lastFrameTime = now;
            }

            if (
              ws.readyState === WebSocket.OPEN &&
              !waitingForResponseRef.current &&
              videoRef.current.srcObject &&
              videoRef.current.readyState >= 2
            ) {
              const vw = videoRef.current.videoWidth;
              const vh = videoRef.current.videoHeight;

              if (vw > 0 && vh > 0) {
                // Scale down webcam feed to a manageable size (max width 640)
                // while maintaining aspect ratio. Sends the FULL frame to backend.
                const imgRatio = vw / vh;
                const targetWidth = 640;
                const renderW = targetWidth;
                const renderH = Math.round(targetWidth / imgRatio);

                if (canvasRef.current.width !== renderW) canvasRef.current.width = renderW;
                if (canvasRef.current.height !== renderH) canvasRef.current.height = renderH;

                ctx.drawImage(videoRef.current, 0, 0, renderW, renderH);

                waitingForResponseRef.current = true;
                frameCount++;
                canvasRef.current.toBlob(
                  (blob) => {
                    if (ws.readyState === WebSocket.OPEN && blob) {
                      blob.arrayBuffer().then(buffer => ws.send(buffer));
                    } else {
                      waitingForResponseRef.current = false;
                    }
                  },
                  'image/jpeg',
                  0.7
                );
              }
            }

            setTimeout(loop, 33); // 30 FPS target
          };

          setTimeout(loop, 33);
        };

        ws.onmessage = async (event) => {
          waitingForResponseRef.current = false;
          if (event.data instanceof Blob) {
            try {
              const pngBlob = new Blob([event.data], { type: 'image/png' });
              const bitmap = await createImageBitmap(pngBlob);
              // Clean up the old bitmap if it exists
              if (segmentedImgRef.current && segmentedImgRef.current.close) {
                segmentedImgRef.current.close();
              }
              segmentedImgRef.current = bitmap;
            } catch (err) {
              console.error('[useWebRTC] Failed to decode frame:', err);
            }
          }
        };

        ws.onclose = () => {
          connectionStatusRef.current = 'disconnected';
          setConnectionStatus('disconnected');
          isRunningRef.current = false;
        };

        ws.onerror = () => {
          connectionStatusRef.current = 'error';
          setConnectionStatus('error');
        };
      } catch (err) {
        console.error('[useWebRTC] WS Connection failed:', err);
        connectionStatusRef.current = 'error';
        setConnectionStatus('error');
        disconnect();
      }
    },
    [disconnect]
  );

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  /**
   * CRITICAL: Return a STABLE object. We use useRef to hold the return value
   * so the object identity never changes. Individual properties are updated
   * in-place via the ref. Components that need reactive updates should use
   * the connectionStatus and stats state values directly.
   *
   * The compositing loop in App.jsx reads segmentedImgRef.current directly —
   * it does NOT depend on this hook's identity.
   */
  const stableRef = useRef({
    connectionStatus: 'disconnected',
    stats: { fps: 0, latency: 0, bitrate: 0 },
    connect: null,
    disconnect: null,
    segmentedImgRef,
  });

  // Update the stable ref's properties without changing the ref identity
  stableRef.current.connectionStatus = connectionStatus;
  stableRef.current.stats = stats;
  stableRef.current.connect = connect;
  stableRef.current.disconnect = disconnect;

  return stableRef.current;
}
