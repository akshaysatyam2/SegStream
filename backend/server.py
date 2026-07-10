"""
SegStream Backend — WebRTC Signaling Server
=============================================

Main entry point for the SegStream backend.  Provides an aiohttp HTTP server
with aiortc-based WebRTC signaling so the browser can send screen + webcam
media tracks.  Incoming frames are processed through the segmentation →
compositing pipeline and optionally written to a local file and/or pushed
to an RTSP stream.

Endpoints
---------
- ``POST /offer``             — WebRTC SDP offer/answer handshake.
- ``GET  /api/status``        — Server health, provider info, recording state.
- ``POST /api/config``        — Update overlay / recording settings at runtime.
- ``POST /api/recording/start`` — Start local file recording.
- ``POST /api/recording/stop``  — Stop recording, return file path.

Usage::

    python backend/server.py
    python -m backend.server

Author: Akshay
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys
import time
from typing import Any, Dict, Set

import cv2
import numpy as np
from aiohttp import web
from aiortc import (
    MediaStreamTrack,
    RTCPeerConnection,
    RTCSessionDescription,
)
from aiortc.contrib.media import MediaRelay
from av import VideoFrame

from .config import SegStreamConfig
from .providers import detect_execution_provider
from .segmentation import PersonSegmenter
from .compositor import FrameCompositor
from .recorder import VideoRecorder
from .streamer import RTSPStreamer

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("segstream.server")

# ---------------------------------------------------------------------------
# Module-level state (initialised in ``init_app``)
# ---------------------------------------------------------------------------
config: SegStreamConfig
segmenter: PersonSegmenter
compositor: FrameCompositor
recorder: VideoRecorder
streamer: RTSPStreamer
relay: MediaRelay

# Active peer connections — tracked for graceful shutdown.
peer_connections: Set[RTCPeerConnection] = set()

# Latest frames from each track (written by track consumers, read by the
# processing loop).  Protected by an asyncio.Lock in the processing task.
_latest_screen_frame: np.ndarray | None = None
_latest_webcam_frame: np.ndarray | None = None
_audio_track: MediaStreamTrack | None = None
_frame_lock: asyncio.Lock
_processing_task: asyncio.Task | None = None


# ╔═════════════════════════════════════════════════════════════════════════╗
# ║  WebRTC Signaling                                                     ║
# ╚═════════════════════════════════════════════════════════════════════════╝

async def offer_handler(request: web.Request) -> web.Response:
    """Handle a WebRTC SDP offer from the browser.

    Expects a JSON body with ``sdp`` and ``type`` fields.  Creates an
    RTCPeerConnection, attaches track handlers, and returns the SDP answer.

    Author: Akshay
    """
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    sdp = body.get("sdp")
    sdp_type = body.get("type")

    if not sdp or not sdp_type:
        return web.json_response(
            {"error": "Missing 'sdp' or 'type' in request body"}, status=400
        )

    offer = RTCSessionDescription(sdp=sdp, type=sdp_type)
    pc = RTCPeerConnection()
    peer_connections.add(pc)

    logger.info("New WebRTC offer received (total peers: %d)", len(peer_connections))

    @pc.on("connectionstatechange")
    async def on_connectionstatechange() -> None:
        state = pc.connectionState
        logger.info("Peer connection state → %s", state)
        if state in ("failed", "closed"):
            await pc.close()
            peer_connections.discard(pc)

    @pc.on("track")
    def on_track(track: MediaStreamTrack) -> None:
        logger.info("Received %s track: %s", track.kind, track.id)

        if track.kind == "audio":
            global _audio_track
            _audio_track = track
            logger.info("Received audio track: %s", track.id)
            return
        elif track.kind != "video":
            logger.debug("Ignoring non-video/audio track: %s", track.kind)
            return

        # We use a simple heuristic: the first video track is assumed to be
        # the screen capture, the second is the webcam.  The frontend can
        # also signal intent via track labels/metadata, but for now this
        # ordering convention suffices.
        asyncio.ensure_future(_consume_track(track))

        @track.on("ended")
        async def on_ended() -> None:
            logger.info("Track %s ended", track.id)

    # Set remote description, create answer, and set local description.
    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.json_response(
        {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
    )


# Track counter to differentiate screen vs webcam.
_track_counter: int = 0
_track_counter_lock: asyncio.Lock = asyncio.Lock()


async def _consume_track(track: MediaStreamTrack) -> None:
    """Read frames from a WebRTC video track and store them for processing.

    Uses a module-level counter to assign the first track as *screen* and the
    second as *webcam*.

    Author: Akshay
    """
    global _latest_screen_frame, _latest_webcam_frame, _track_counter

    async with _track_counter_lock:
        track_idx = _track_counter
        _track_counter += 1

    role = "screen" if track_idx % 2 == 0 else "webcam"
    logger.info("Track %s assigned role: %s", track.id, role)

    while True:
        try:
            frame: VideoFrame = await track.recv()
        except Exception:
            # Track ended or connection dropped.
            logger.debug("Track %s recv() ended", track.id)
            break

        # Convert av.VideoFrame → numpy BGR array.
        img = frame.to_ndarray(format="bgr24")

        async with _frame_lock:
            if role == "screen":
                _latest_screen_frame = img
            else:
                _latest_webcam_frame = img


# ╔═════════════════════════════════════════════════════════════════════════╗
# ║  Frame Processing Loop                                                ║
# ╚═════════════════════════════════════════════════════════════════════════╝

async def _processing_loop() -> None:
    """Background task that composites frames at the target FPS.

    Reads the latest screen + webcam frames, runs person segmentation on the
    webcam frame, composites the result onto the screen frame, and writes
    the output to the recorder and/or RTSP streamer.

    Author: Akshay
    """
    global _latest_screen_frame, _latest_webcam_frame

    target_interval = 1.0 / config.target_fps
    logger.info("Processing loop started (target %.1f FPS)", config.target_fps)

    while True:
        t0 = time.monotonic()

        screen: np.ndarray | None = None
        webcam: np.ndarray | None = None

        async with _frame_lock:
            if _latest_screen_frame is not None:
                screen = _latest_screen_frame.copy()
            if _latest_webcam_frame is not None:
                webcam = _latest_webcam_frame.copy()

        if screen is not None and webcam is not None:
            # Run segmentation + compositing in a thread to avoid blocking
            # the event loop.
            composited = await asyncio.get_event_loop().run_in_executor(
                None, _process_frame_pair, screen, webcam
            )
        elif screen is not None:
            composited = screen
        elif webcam is not None:
            composited = webcam
        else:
            composited = None

        if composited is not None:
            # Write to recorder and/or streamer.
            if recorder.is_recording:
                recorder.write_frame(composited)
            if streamer.is_streaming:
                streamer.push_frame(composited)

        # Throttle to target FPS.
        elapsed = time.monotonic() - t0
        sleep_time = target_interval - elapsed
        if sleep_time > 0.1:
            await asyncio.sleep(sleep_time)
        else:
            # If we're behind, yield briefly to keep the event loop responsive.
            await asyncio.sleep(0.1)


def _process_frame_pair(
    screen: np.ndarray, webcam: np.ndarray
) -> np.ndarray:
    """Synchronous helper: segment webcam → composite onto screen.

    Runs in a thread pool executor to keep the async event loop free.

    Author: Akshay
    """
    person_rgba, mask = segmenter.extract_person(webcam)
    composited = compositor.composite(screen, person_rgba, mask)
    return composited


# ╔═════════════════════════════════════════════════════════════════════════╗
# ║  REST API Handlers                                                    ║
# ╚═════════════════════════════════════════════════════════════════════════╝

async def status_handler(request: web.Request) -> web.Response:
    """``GET /api/status`` — Return server health and runtime info.

    Author: Akshay
    """
    provider_name, _ = detect_execution_provider()

    payload: Dict[str, Any] = {
        "status": "running",
        "version": "0.1.0",
        "provider": provider_name,
        "peers": len(peer_connections),
        "recording": {
            "active": recorder.is_recording,
            "duration": round(recorder.duration, 2),
            "frames": recorder.frame_count,
            "path": recorder.output_path,
        },
        "streaming": {
            "active": streamer.is_streaming,
            "url": config.rtsp_url if config.rtsp_enabled else None,
        },
        "config": config.to_dict(),
    }
    return web.json_response(payload)


async def config_handler(request: web.Request) -> web.Response:
    """``POST /api/config`` — Update runtime configuration.

    Accepts a JSON body whose keys correspond to ``SegStreamConfig`` fields.

    Author: Akshay
    """
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    changed = config.update(body)
    return web.json_response({"updated": changed})


async def recording_start_handler(request: web.Request) -> web.Response:
    """``POST /api/recording/start`` — Start local file recording.

    Optionally accepts ``width`` and ``height`` in the JSON body; defaults to
    1920×1080 if not specified.

    Author: Akshay
    """
    try:
        body = await request.json()
    except (json.JSONDecodeError, Exception):
        body = {}

    width = body.get("width")
    height = body.get("height")

    # If the frontend didn't specify a resolution, infer it from the live screen stream
    if width is None or height is None:
        async with _frame_lock:
            if _latest_screen_frame is not None:
                h, w = _latest_screen_frame.shape[:2]
                width = width or w
                height = height or h
            else:
                width = width or 1920
                height = height or 1080

    try:
        audio_sub = relay.subscribe(_audio_track) if _audio_track else None
        path = await recorder.start_async(width, height, audio_track=audio_sub)
    except RuntimeError as exc:
        return web.json_response({"error": str(exc)}, status=409)

    # Also start RTSP stream if enabled.
    if config.rtsp_enabled and not streamer.is_streaming:
        try:
            streamer.start(width, height)
        except RuntimeError as exc:
            logger.warning("Could not start RTSP stream: %s", exc)

    return web.json_response({"recording": True, "path": path})


async def recording_stop_handler(request: web.Request) -> web.Response:
    """``POST /api/recording/stop`` — Stop recording and return file path.

    Author: Akshay
    """
    try:
        path = await recorder.stop_async()
    except RuntimeError as exc:
        return web.json_response({"error": str(exc)}, status=409)

    # Also stop RTSP stream.
    if streamer.is_streaming:
        streamer.stop()

    return web.json_response({"recording": False, "path": path})


# ╔═════════════════════════════════════════════════════════════════════════╗
# ║  CORS Middleware                                                      ║
# ╚═════════════════════════════════════════════════════════════════════════╝

@web.middleware
async def cors_middleware(
    request: web.Request, handler: Any
) -> web.StreamResponse:
    """Simple CORS middleware for frontend dev server compatibility.

    Author: Akshay
    """
    # Handle preflight OPTIONS requests.
    if request.method == "OPTIONS":
        response = web.Response(status=204)
    else:
        try:
            response = await handler(request)
        except web.HTTPException as exc:
            response = exc

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Max-Age"] = "3600"

    return response


# ╔═════════════════════════════════════════════════════════════════════════╗
# ║  Application Factory & Lifecycle                                      ║
# ╚═════════════════════════════════════════════════════════════════════════╝

async def on_startup(app: web.Application) -> None:
    """Initialise subsystems when the HTTP server starts.

    Author: Akshay
    """
    global config, segmenter, compositor, recorder, streamer, relay
    global _frame_lock, _processing_task

    config = app["config"]
    segmenter = PersonSegmenter(config)
    compositor = FrameCompositor(config)
    recorder = VideoRecorder(config)
    streamer = RTSPStreamer(config)
    relay = MediaRelay()

    _frame_lock = asyncio.Lock()

    # Start background processing loop.
    _processing_task = asyncio.ensure_future(_processing_loop())

    logger.info("SegStream backend ready on http://%s:%d", config.host, config.port)


async def on_shutdown(app: web.Application) -> None:
    """Clean up on server shutdown.

    Author: Akshay
    """
    global _processing_task

    logger.info("Shutting down SegStream backend…")

    # Cancel the processing loop.
    if _processing_task is not None:
        _processing_task.cancel()
        try:
            await _processing_task
        except asyncio.CancelledError:
            pass

    # Close all peer connections.
    coros = [pc.close() for pc in peer_connections]
    if coros:
        await asyncio.gather(*coros, return_exceptions=True)
    peer_connections.clear()

    # Stop recording / streaming.
    if recorder.is_recording:
        try:
            await recorder.stop_async()
        except RuntimeError:
            pass

    if streamer.is_streaming:
        streamer.stop()

    logger.info("Shutdown complete.")


def create_app(cfg: SegStreamConfig | None = None) -> web.Application:
    """Create and configure the aiohttp web application.

    Parameters
    ----------
    cfg:
        Optional configuration override.  Uses defaults if ``None``.

    Returns
    -------
    web.Application
        The fully-configured aiohttp application, ready to be run.

    Author: Akshay
    """
    if cfg is None:
        cfg = SegStreamConfig()

    app = web.Application(middlewares=[cors_middleware])
    app["config"] = cfg

    # Register routes.
    app.router.add_post("/offer", offer_handler)
    app.router.add_get("/api/status", status_handler)
    app.router.add_post("/api/config", config_handler)
    app.router.add_post("/api/recording/start", recording_start_handler)
    app.router.add_post("/api/recording/stop", recording_stop_handler)

    # Lifecycle hooks.
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    return app


# ╔═════════════════════════════════════════════════════════════════════════╗
# ║  Main Entry Point                                                     ║
# ╚═════════════════════════════════════════════════════════════════════════╝

def main() -> None:
    """Run the SegStream backend server.

    Supports configuration via:
        1. Environment variables (``SEGSTREAM_*``).
        2. A ``config.json`` file in the current directory (if present).
        3. Built-in defaults.

    Author: Akshay
    """
    import os
    from pathlib import Path

    # Try loading config from JSON if the file exists.
    config_path = Path("config.json")
    if config_path.exists():
        cfg = SegStreamConfig.from_json(config_path)
        logger.info("Loaded config from %s", config_path)
    else:
        cfg = SegStreamConfig()

    # Register signal handlers for graceful shutdown.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: asyncio.ensure_future(_signal_shutdown(loop)))
        except NotImplementedError:
            # Windows doesn't support add_signal_handler.
            pass

    app = create_app(cfg)

    logger.info("Starting SegStream server on %s:%d", cfg.host, cfg.port)
    web.run_app(app, host=cfg.host, port=cfg.port, print=None)


async def _signal_shutdown(loop: asyncio.AbstractEventLoop) -> None:
    """Handle SIGINT/SIGTERM by stopping the event loop.

    Author: Akshay
    """
    logger.info("Received shutdown signal — stopping…")
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    loop.stop()


if __name__ == "__main__":
    main()
