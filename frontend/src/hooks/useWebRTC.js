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

          if (webcamStream) {
            videoRef.current.srcObject = webcamStream;
            videoRef.current.play().catch(e => console.error("Webcam play failed", e));
          } else {
            videoRef.current.srcObject = null;
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
                // Center-crop (emulate object-fit: cover) to 640x640 YOLO native input size.
                // This ensures the face is large and central, avoiding getting cut off later.
                const targetSize = 640;
                if (canvasRef.current.width !== targetSize) canvasRef.current.width = targetSize;
                if (canvasRef.current.height !== targetSize) canvasRef.current.height = targetSize;

                const imgRatio = vw / vh;
                const boxRatio = 1; // 640 / 640
                
                let renderW, renderH, offsetX, offsetY;
                if (imgRatio > boxRatio) {
                   renderH = targetSize;
                   renderW = targetSize * imgRatio;
                   offsetX = (targetSize - renderW) / 2;
                   offsetY = 0;
                } else {
                   renderW = targetSize;
                   renderH = targetSize / imgRatio;
                   offsetX = 0;
                   offsetY = (targetSize - renderH) / 2;
                }
                
                // Clear the canvas just in case, though drawImage covers it
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, targetSize, targetSize);
                
                ctx.drawImage(videoRef.current, offsetX, offsetY, renderW, renderH);

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
              const bitmap = await createImageBitmap(event.data);
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
