/**
 * useMediaCapture.js — Browser Media Capture Hook
 *
 * Wraps the browser's MediaDevices API to provide a clean interface
 * for capturing screen (getDisplayMedia) and webcam (getUserMedia)
 * streams. Enumerates available devices and allows switching between
 * them on the fly.
 *
 * This hook manages its own MediaStream lifecycle — it will stop
 * all tracks when the component unmounts or when stop functions
 * are called explicitly.
 *
 * Usage:
 *   const mediaCapture = useMediaCapture(dispatch);
 *   mediaCapture.startScreenCapture();
 *   mediaCapture.startWebcam();
 *   mediaCapture.stopAll();
 *
 * @author Akshay Satyam
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useMediaCapture — Custom hook for screen + webcam capture.
 *
 * @param {Function} dispatch — StreamContext dispatch (optional, for
 *   syncing streams into global state). App.jsx handles syncing via
 *   useEffect, so dispatch is available but not directly used here
 *   for stream updates.
 *
 * @returns {object} Media capture API
 */
export function useMediaCapture(dispatch) {
  /* --- State --- */
  const [screenStream, setScreenStream] = useState(null);
  const [webcamStream, setWebcamStream] = useState(null);
  const [micStream, setMicStream] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState({
    videoInput: '',  // deviceId for webcam
    audioInput: '',  // deviceId for microphone
  });

  /* Refs to hold current streams for cleanup in callbacks */
  const screenStreamRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const micStreamRef = useRef(null);

  /* ============================================================
     DEVICE ENUMERATION
     Query available media devices on mount and whenever a device
     changes (e.g., USB webcam plugged in/out).
     ============================================================ */
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices(devices);

      /* Auto-select first video + audio input if none selected */
      setSelectedDevices((prev) => {
        const updated = { ...prev };

        if (!updated.videoInput) {
          const firstVideo = devices.find((d) => d.kind === 'videoinput');
          if (firstVideo) updated.videoInput = firstVideo.deviceId;
        }

        if (!updated.audioInput) {
          const firstAudio = devices.find((d) => d.kind === 'audioinput');
          if (firstAudio) updated.audioInput = firstAudio.deviceId;
        }

        return updated;
      });
    } catch (err) {
      console.error('[useMediaCapture] Failed to enumerate devices:', err);
    }
  }, []);

  /* Enumerate on mount + listen for device changes */
  useEffect(() => {
    enumerateDevices();

    /* Re-enumerate when devices change (plug/unplug) */
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  /* ============================================================
     SCREEN CAPTURE — getDisplayMedia
     Captures the user's screen, window, or tab. The browser shows
     its own picker UI. We listen for the 'ended' event on tracks
     to detect when the user stops sharing via the browser UI.
     ============================================================ */
  const startScreenCapture = useCallback(async (options = {}) => {
    try {
      /* Stop existing screen stream if any */
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          ...options.video,
        },
        audio: options.audio ?? true, // Capture system audio if available
      });

      /* Listen for the user clicking "Stop sharing" in the browser */
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          setScreenStream(null);
          screenStreamRef.current = null;
        });
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);

      /* Re-enumerate in case permissions unlocked new device labels */
      enumerateDevices();

      return stream;
    } catch (err) {
      /* User cancelled the picker — not an error we need to surface */
      if (err.name === 'NotAllowedError') {
        console.info('[useMediaCapture] Screen capture was cancelled by user.');
      } else {
        console.error('[useMediaCapture] Screen capture failed:', err);
      }
      return null;
    }
  }, [enumerateDevices]);

  /* ============================================================
     WEBCAM CAPTURE — getUserMedia
     Captures video from the user's webcam and audio from their
     microphone. Uses the selected device IDs from state.
     ============================================================ */
  const startWebcam = useCallback(async (options = {}) => {
    try {
      /* Stop existing webcam stream if any */
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          deviceId: selectedDevices.videoInput
            ? { exact: selectedDevices.videoInput }
            : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          ...options.video,
        },
        audio: {
          deviceId: selectedDevices.audioInput
            ? { exact: selectedDevices.audioInput }
            : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          ...options.audio,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      /* Listen for track ended events */
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          setWebcamStream(null);
          webcamStreamRef.current = null;
        });
      });

      webcamStreamRef.current = stream;
      setWebcamStream(stream);

      /* Re-enumerate to get proper labels (some browsers require permission first) */
      enumerateDevices();

      return stream;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.info('[useMediaCapture] Webcam access was denied by user.');
      } else {
        console.error('[useMediaCapture] Webcam capture failed:', err);
      }
      return null;
    }
  }, [selectedDevices.videoInput, selectedDevices.audioInput, enumerateDevices]);

  /* ============================================================
     MICROPHONE CAPTURE — getUserMedia (Audio Only)
     Captures standalone microphone for narration.
     ============================================================ */
  const startMic = useCallback(async (options = {}) => {
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevices.audioInput
            ? { exact: selectedDevices.audioInput }
            : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          ...options.audio,
        },
      });
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          setMicStream(null);
          micStreamRef.current = null;
        });
      });
      micStreamRef.current = stream;
      setMicStream(stream);
      return stream;
    } catch (err) {
      console.error('[useMediaCapture] Mic capture failed:', err);
      return null;
    }
  }, [selectedDevices.audioInput]);

  /* ============================================================
     STOP FUNCTIONS
     Clean up MediaStream tracks to release camera/screen access.
     ============================================================ */
  const stopScreenCapture = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
      setWebcamStream(null);
    }
  }, []);

  const stopMic = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setMicStream(null);
    }
  }, []);

  const stopAll = useCallback(() => {
    stopScreenCapture();
    stopWebcam();
    stopMic();
  }, [stopScreenCapture, stopWebcam, stopMic]);

  /* ============================================================
     DEVICE SELECTION
     Update selected device IDs. If a stream is already active
     for that device kind, restart it with the new device.
     ============================================================ */
  const selectDevice = useCallback(
    (kind, deviceId) => {
      setSelectedDevices((prev) => {
        const updated = { ...prev };

        if (kind === 'videoinput') {
          updated.videoInput = deviceId;
        } else if (kind === 'audioinput') {
          updated.audioInput = deviceId;
        }

        return updated;
      });
    },
    []
  );

  /* ============================================================
     CLEANUP ON UNMOUNT
     Stop all active streams when the hook's parent unmounts to
     prevent orphaned MediaStreams holding the camera open.
     ============================================================ */
  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /* ============================================================
     PUBLIC API
     Return everything components need to manage media capture.
     ============================================================ */
  return {
    screenStream,
    webcamStream,
    micStream,
    startScreenCapture,
    startWebcam,
    startMic,
    stopScreenCapture,
    stopWebcam,
    stopMic,
    stopAll,
    availableDevices,
    selectedDevices,
    selectDevice,
  };
}
