/**
 * useWebRTC.js — WebRTC Signaling & Peer Connection Hook
 *
 * Manages the WebRTC peer connection to the SegStream Python backend.
 * Handles SDP offer/answer exchange via HTTP POST to /offer endpoint,
 * ICE candidate gathering, track attachment, and periodic stats
 * collection (FPS, bitrate, latency).
 *
 * The signaling flow:
 *   1. Frontend creates RTCPeerConnection with ICE config
 *   2. Adds screen + webcam tracks as senders
 *   3. Creates an SDP offer
 *   4. POSTs the offer to backend /offer endpoint
 *   5. Backend returns an SDP answer
 *   6. Frontend sets the remote description (answer)
 *   7. ICE candidates are gathered and exchanged
 *   8. Media flows over the established connection
 *
 * Usage:
 *   const webrtc = useWebRTC(dispatch);
 *   webrtc.connect(screenStream, webcamStream);
 *   webrtc.disconnect();
 *
 * @author Akshay Satyam
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WEBRTC_CONFIG, BACKEND_URL } from '../utils/constants.js';

/**
 * useWebRTC — Custom hook for WebRTC peer connection management.
 *
 * @param {Function} dispatch — StreamContext dispatch function
 * @returns {object} WebRTC connection API
 */
export function useWebRTC(dispatch) {
  /* --- State --- */
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [stats, setStats] = useState({ fps: 0, latency: 0, bitrate: 0 });

  /* --- Refs --- */
  const peerConnectionRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const prevBytesRef = useRef(0);
  const prevTimestampRef = useRef(0);

  /* ============================================================
     STATS COLLECTION
     Periodically poll getStats() on the peer connection to
     extract FPS, round-trip time, and bitrate for the StatusBar.
     ============================================================ */
  const startStatsCollection = useCallback((pc) => {
    /* Clear any existing interval */
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    /* Poll every 1 second */
    statsIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState === 'closed') {
        clearInterval(statsIntervalRef.current);
        return;
      }

      try {
        const reports = await pc.getStats();
        let fps = 0;
        let latency = 0;
        let totalBytesSent = 0;
        let timestamp = 0;

        reports.forEach((report) => {
          /* Extract FPS from outbound video RTP stats */
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            fps = report.framesPerSecond || 0;
            totalBytesSent = report.bytesSent || 0;
            timestamp = report.timestamp || Date.now();
          }

          /* Extract round-trip time from candidate-pair stats */
          if (report.type === 'candidate-pair' && report.nominated) {
            latency = Math.round((report.currentRoundTripTime || 0) * 1000);
          }
        });

        /* Calculate bitrate (kbps) from bytes sent delta */
        let bitrate = 0;
        if (prevBytesRef.current > 0 && prevTimestampRef.current > 0) {
          const bytesDelta = totalBytesSent - prevBytesRef.current;
          const timeDelta = (timestamp - prevTimestampRef.current) / 1000; // seconds
          if (timeDelta > 0) {
            bitrate = Math.round((bytesDelta * 8) / timeDelta / 1000); // kbps
          }
        }
        prevBytesRef.current = totalBytesSent;
        prevTimestampRef.current = timestamp;

        setStats({ fps, latency, bitrate });
      } catch (err) {
        console.warn('[useWebRTC] Stats collection error:', err);
      }
    }, 1000);
  }, []);

  /** Stop the stats polling interval */
  const stopStatsCollection = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    prevBytesRef.current = 0;
    prevTimestampRef.current = 0;
  }, []);

  /* ============================================================
     DISCONNECT
     Tears down the peer connection, stops stats, resets state.
     ============================================================ */
  const disconnect = useCallback(() => {
    stopStatsCollection();

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setConnectionStatus('disconnected');
    setStats({ fps: 0, latency: 0, bitrate: 0 });
  }, [stopStatsCollection]);

  /* ============================================================
     SEND OFFER (SDP Exchange)
     Creates an SDP offer, sends it to the backend's /offer
     endpoint via HTTP POST, and applies the returned SDP answer.
     ============================================================ */
  const sendOffer = useCallback(
    async (pc, backendUrl) => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        /* Wait for ICE gathering to complete (or timeout after 3s) */
        await new Promise((resolve) => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
          } else {
            const timeout = setTimeout(resolve, 3000);
            pc.addEventListener('icegatheringstatechange', () => {
              if (pc.iceGatheringState === 'complete') {
                clearTimeout(timeout);
                resolve();
              }
            });
          }
        });

        /* POST the offer SDP to the backend */
        const response = await fetch(`${backendUrl}/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: pc.localDescription.sdp,
            type: pc.localDescription.type,
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
        }

        const answer = await response.json();

        /* Apply the backend's SDP answer */
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            sdp: answer.sdp,
            type: answer.type,
          })
        );
      } catch (err) {
        console.error('[useWebRTC] SDP exchange failed:', err);
        setConnectionStatus('error');
        throw err;
      }
    },
    []
  );

  /* ============================================================
     CONNECT
     Creates a new RTCPeerConnection, adds media tracks, performs
     SDP exchange with the backend, and starts stats collection.
     ============================================================ */
  const connect = useCallback(
    async (screenStream, webcamStream, backendUrl) => {
      /* Disconnect any existing connection first */
      disconnect();

      const url = backendUrl || BACKEND_URL;
      setConnectionStatus('connecting');

      try {
        /* Create the peer connection with ICE configuration */
        const pc = new RTCPeerConnection(WEBRTC_CONFIG);
        peerConnectionRef.current = pc;

        /* --- Event handlers --- */

        /* Monitor connection state changes */
        pc.addEventListener('connectionstatechange', () => {
          const state = pc.connectionState;

          if (state === 'connected') {
            setConnectionStatus('connected');
          } else if (state === 'failed' || state === 'closed') {
            setConnectionStatus(state === 'failed' ? 'error' : 'disconnected');
            stopStatsCollection();
          } else if (state === 'disconnected') {
            setConnectionStatus('disconnected');
          }
        });

        /* Log ICE connection state for debugging */
        pc.addEventListener('iceconnectionstatechange', () => {
          console.info('[useWebRTC] ICE state:', pc.iceConnectionState);
        });

        /* Log ICE candidate events for debugging */
        pc.addEventListener('icecandidate', (event) => {
          if (event.candidate) {
            console.debug('[useWebRTC] ICE candidate:', event.candidate.candidate);
          }
        });

        /* --- Add media tracks using transceivers to guarantee order --- */
        
        // 1. Screen Video (always first)
        const screenVideoTrack = screenStream?.getVideoTracks()[0];
        if (screenVideoTrack) {
          pc.addTransceiver(screenVideoTrack, { direction: 'sendonly' });
        } else {
          pc.addTransceiver('video', { direction: 'sendonly' });
        }

        // 2. Webcam Video (always second)
        const webcamVideoTrack = webcamStream?.getVideoTracks()[0];
        if (webcamVideoTrack) {
          pc.addTransceiver(webcamVideoTrack, { direction: 'sendonly' });
        } else {
          pc.addTransceiver('video', { direction: 'sendonly' });
        }

        // 3. Audio (from screen or webcam)
        const audioTracks = [
          ...(screenStream?.getAudioTracks() || []),
          ...(webcamStream?.getAudioTracks() || [])
        ];
        if (audioTracks.length > 0) {
          pc.addTransceiver(audioTracks[0], { direction: 'sendonly' });
        } else {
          pc.addTransceiver('audio', { direction: 'sendonly' });
        }

        /* --- Perform SDP exchange --- */
        await sendOffer(pc, url);

        /* --- Start collecting stats --- */
        startStatsCollection(pc);

      } catch (err) {
        console.error('[useWebRTC] Connection failed:', err);
        setConnectionStatus('error');
        disconnect();
      }
    },
    [disconnect, sendOffer, startStatsCollection, stopStatsCollection]
  );

  /* ============================================================
     CLEANUP ON UNMOUNT
     Ensure we tear down the connection when the hook unmounts
     to prevent orphaned WebRTC connections.
     ============================================================ */
  useEffect(() => {
    return () => {
      stopStatsCollection();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [stopStatsCollection]);

  /* ============================================================
     PUBLIC API
     Return everything components need to manage the WebRTC link.
     ============================================================ */
  return useMemo(
    () => ({
      connectionStatus,
      stats,
      connect,
      disconnect,
      sendOffer,
    }),
    [connectionStatus, stats, connect, disconnect, sendOffer]
  );
}
