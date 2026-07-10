/**
 * constants.js — SegStream Application Constants
 *
 * Central source of truth for all magic numbers, breakpoints,
 * default values, and configuration objects used throughout
 * the frontend. Import from here rather than hardcoding values
 * in components.
 *
 * @author Akshay Satyam
 */

/* ============================================================
   RESPONSIVE BREAKPOINTS
   Used by useIsDesktop() in App.jsx and MobileViewer to decide
   which layout to render. Values are min-widths in pixels.
   ============================================================ */
export const BREAKPOINTS = {
  phone: 480,    // Small phones — single-column, minimal UI
  tablet: 640,   // Tablets — card-based MobileViewer layout
  laptop: 1024,  // Laptops — full studio grid kicks in
  desktop: 1440, // Large desktops — wider sidebars, more space
};

/* ============================================================
   DEFAULT OVERLAY POSITION & SIZE
   Initial position/size for the webcam overlay on the stream
   preview. Values are in CSS pixels, relative to the preview
   container's top-left corner.
   ============================================================ */
export const DEFAULT_OVERLAY = {
  x: 20,       // Distance from left edge of preview
  y: 20,       // Distance from top edge of preview
  width: 320,  // Overlay width in px
  height: 240, // Overlay height in px
};

/* ============================================================
   BACKEND URL
   Base URL for the Python backend. In development this is
   localhost:8080; in production it could be anything.
   Reads from VITE_BACKEND_URL env var, with a sensible default.
   ============================================================ */
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

/* ============================================================
   WEBRTC CONFIGURATION
   ICE server configuration for the RTCPeerConnection.
   Using free Google STUN servers for NAT traversal.
   Add TURN servers here if you need relay support.
   ============================================================ */
export const WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  /* Bundle all media onto a single transport for efficiency */
  bundlePolicy: 'max-bundle',
  /* Use all available candidates (host, srflx, relay) */
  iceCandidatePoolSize: 2,
};

/* ============================================================
   SUPPORTED RESOLUTIONS
   Dropdown options for the resolution selector in StreamSettings.
   Each entry maps a human-readable label to width × height.
   ============================================================ */
export const SUPPORTED_RESOLUTIONS = [
  { label: '4K (3840×2160)',   width: 3840, height: 2160 },
  { label: '1440p (2560×1440)', width: 2560, height: 1440 },
  { label: '1080p (1920×1080)', width: 1920, height: 1080 },
  { label: '720p (1280×720)',   width: 1280, height: 720 },
  { label: '480p (854×480)',    width: 854,  height: 480 },
  { label: '360p (640×360)',    width: 640,  height: 360 },
];

/* ============================================================
   RECORDING FORMATS
   Supported output formats for the recording. The backend
   handles the actual muxing — the frontend just tells it
   which format to use.
   ============================================================ */
export const RECORDING_FORMATS = [
  { label: 'MP4 (H.264)',     value: 'mp4' },
  { label: 'WebM (VP9)',      value: 'webm' },
  { label: 'MKV (H.265)',     value: 'mkv' },
  { label: 'FLV (H.264)',     value: 'flv' },
];
