/**
 * StreamContext.jsx — Global State Management for SegStream
 *
 * Provides a React Context that holds all shared application state:
 *   - Media streams (screen capture, webcam)
 *   - WebRTC connection status
 *   - Recording state
 *   - Webcam overlay position/size/opacity/shape
 *   - Real-time stats (FPS, latency, bitrate)
 *   - User settings (resolution, quality, format, RTSP, backend URL)
 *
 * Uses useReducer for predictable state transitions. Actions are
 * dispatched from hooks (useMediaCapture, useWebRTC) and components
 * (OverlayControl, StreamSettings, RecordingControls).
 *
 * Usage:
 *   // In main.jsx — wrap the app
 *   <StreamProvider><App /></StreamProvider>
 *
 *   // In any component — consume state
 *   const { state, dispatch } = useStream();
 *
 * @author Akshay Satyam
 */

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
} from 'react';

import { DEFAULT_OVERLAY, BACKEND_URL } from '../utils/constants.js';

/* ============================================================
   INITIAL STATE
   Defines the shape of the entire application state tree.
   ============================================================ */
const initialState = {
  /* --- Media Streams --- */
  screenStream: null,   // MediaStream from getDisplayMedia
  webcamStream: null,   // MediaStream from getUserMedia (video+audio)
  micStream: null,      // MediaStream from getUserMedia (audio only)

  /* --- Connection --- */
  connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'

  /* --- Recording --- */
  isRecording: false,

  /* --- Webcam Overlay --- */
  overlay: {
    x: DEFAULT_OVERLAY.x,
    y: DEFAULT_OVERLAY.y,
    width: DEFAULT_OVERLAY.width,
    height: DEFAULT_OVERLAY.height,
    opacity: 1,          // 0–1 opacity for the webcam overlay
    shape: 'rounded',    // 'rectangle' | 'circle' | 'rounded'
  },

  /* --- Real-Time Stats --- */
  stats: {
    fps: 0,
    latency: 0,   // milliseconds
    bitrate: 0,   // kbps
  },

  /* --- UI State --- */
  previewRect: {
    width: 800,
    height: 450,
  },

  /* --- User Settings --- */
  settings: {
    resolution: { width: 1920, height: 1080 },
    quality: 80,           // 0–100 quality slider
    format: 'mp4',         // Recording output format
    rtspEnabled: false,    // Whether to enable RTSP re-streaming
    backendUrl: BACKEND_URL,
    padding: {             // Directional padding around the screen recording
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
  },
};

/* ============================================================
   REDUCER
   Pure function that handles all state transitions. Every
   action has a `type` string and a `payload` value.
   ============================================================ */
function streamReducer(state, action) {
  switch (action.type) {
    /* --- Media Stream Actions --- */
    case 'SET_SCREEN_STREAM':
      return { ...state, screenStream: action.payload };

    case 'SET_WEBCAM_STREAM':
      return { ...state, webcamStream: action.payload };
      
    case 'SET_MIC_STREAM':
      return { ...state, micStream: action.payload };

    /* --- Connection Actions --- */
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };

    /* --- Recording Actions --- */
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload };

    case 'TOGGLE_RECORDING':
      return { ...state, isRecording: !state.isRecording };

    /* --- Overlay Actions --- */
    case 'SET_OVERLAY':
      return {
        ...state,
        overlay: { ...state.overlay, ...action.payload },
      };

    case 'RESET_OVERLAY':
      return {
        ...state,
        overlay: {
          ...initialState.overlay,
        },
      };

    /* --- UI Actions --- */
    case 'SET_PREVIEW_RECT':
      return { ...state, previewRect: action.payload };

    /* --- Stats Actions --- */
    case 'UPDATE_STATS':
      return {
        ...state,
        stats: { ...state.stats, ...action.payload },
      };

    /* --- Settings Actions --- */
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };

    case 'SET_RESOLUTION':
      return {
        ...state,
        settings: { ...state.settings, resolution: action.payload },
      };

    case 'SET_FORMAT':
      return {
        ...state,
        settings: { ...state.settings, format: action.payload },
      };

    case 'SET_QUALITY':
      return {
        ...state,
        settings: { ...state.settings, quality: action.payload },
      };

    case 'TOGGLE_RTSP':
      return {
        ...state,
        settings: {
          ...state.settings,
          rtspEnabled: !state.settings.rtspEnabled,
        },
      };

    case 'SET_BACKEND_URL':
      return {
        ...state,
        settings: { ...state.settings, backendUrl: action.payload },
      };

    /* --- Catch-all for unknown actions --- */
    default:
      console.warn(`[StreamContext] Unknown action: ${action.type}`);
      return state;
  }
}

/* ============================================================
   CONTEXT + PROVIDER
   StreamContext holds { state, dispatch }. StreamProvider wraps
   the app and makes context available to all children.
   ============================================================ */
const StreamContext = createContext(null);

/**
 * StreamProvider — Wrap your app with this to enable useStream().
 * Memoizes the context value to prevent unnecessary re-renders
 * when the provider re-renders without state changes.
 */
export function StreamProvider({ children }) {
  const [state, dispatch] = useReducer(streamReducer, initialState);

  /* Memoize to stabilize the context value reference */
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <StreamContext.Provider value={value}>
      {children}
    </StreamContext.Provider>
  );
}

/**
 * useStream — Custom hook to consume the StreamContext.
 * Throws a helpful error if called outside a StreamProvider.
 *
 * @returns {{ state: typeof initialState, dispatch: React.Dispatch }}
 */
export function useStream() {
  const context = useContext(StreamContext);

  if (!context) {
    throw new Error(
      '[SegStream] useStream() must be used within a <StreamProvider>. ' +
      'Wrap your app in <StreamProvider> in main.jsx.'
    );
  }

  return context;
}
