/**
 * useWebRTC.js — WebRTC Signaling & Peer Connection Hook (NOW WEBSOCKETS)
 *
 * Rewritten to use WebSockets for frame-by-frame segmentation to allow
 * local frontend recording.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BACKEND_URL } from '../utils/constants.js';

export function useWebRTC(dispatch) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [stats, setStats] = useState({ fps: 0, latency: 0, bitrate: 0 });

  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const segmentedImgRef = useRef(new Image());
  const waitingForResponseRef = useRef(false);
  const isRunningRef = useRef(false);

  const disconnect = useCallback(() => {
    isRunningRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    
    if (segmentedImgRef.current.src) {
      URL.revokeObjectURL(segmentedImgRef.current.src);
      segmentedImgRef.current.src = '';
    }
  }, []);

  const connect = useCallback(
    async (screenStream, webcamStream, backendUrl) => {
      disconnect();

      const url = backendUrl || BACKEND_URL;
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/segment';
      setConnectionStatus('connecting');

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
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
                // Scale down webcam feed to a manageable size (max width 640) while maintaining aspect ratio
                // This prevents cutting off the face and sends the full frame to the backend.
                const imgRatio = vw / vh;
                const targetWidth = 640;
                const renderW = targetWidth;
                const renderH = targetWidth / imgRatio;
                
                if (canvasRef.current.width !== renderW) canvasRef.current.width = renderW;
                if (canvasRef.current.height !== renderH) canvasRef.current.height = renderH;
                
                ctx.drawImage(videoRef.current, 0, 0, renderW, renderH);

                waitingForResponseRef.current = true;
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
          // event.data is Blob
          if (event.data instanceof Blob) {
            try {
              const pngBlob = new Blob([event.data], { type: 'image/png' });
              const bitmap = await createImageBitmap(pngBlob);
              // Clean up the old bitmap if it exists
              if (segmentedImgRef.current && segmentedImgRef.current.close) {
                segmentedImgRef.current.close();
              }
              // Store the new bitmap for the renderer
              segmentedImgRef.current = bitmap;
            } catch (err) {
              console.error('[useWebRTC] Failed to decode frame:', err);
            }
          }
        };

        ws.onclose = () => {
          setConnectionStatus('disconnected');
          isRunningRef.current = false;
        };

        ws.onerror = () => {
          setConnectionStatus('error');
        };
      } catch (err) {
        console.error('[useWebRTC] WS Connection failed:', err);
        setConnectionStatus('error');
        disconnect();
      }
    },
    [disconnect]
  );

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return useMemo(
    () => ({
      connectionStatus,
      stats,
      connect,
      disconnect,
      segmentedImgRef
    }),
    [connectionStatus, stats, connect, disconnect]
  );
}
