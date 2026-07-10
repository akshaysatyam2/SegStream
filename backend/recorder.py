"""
SegStream Video Recorder
=========================

Records composited frames to a local video file using OpenCV's VideoWriter.
Generates timestamped filenames, manages the recording lifecycle, and exposes
read-only properties for duration and recording state.

Author: Akshay
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from .config import SegStreamConfig

logger = logging.getLogger(__name__)


import asyncio
import fractions
from aiortc.contrib.media import MediaRecorder
from aiortc import MediaStreamTrack
from av import VideoFrame

class ProxyVideoStreamTrack(MediaStreamTrack):
    """
    A track that yields frames pushed from the processing loop.
    We duplicate the latest frame to maintain exactly 30 FPS for the MP4 encoder,
    which fixes the unreadable MP4s caused by the YOLO inference running slowly.
    """
    kind = "video"
    
    def __init__(self, fps: int = 30) -> None:
        super().__init__()
        self._fps = fps
        self._pts = 0
        self._latest_frame: np.ndarray | None = None
        self._first_frame_event = asyncio.Event()
        self._start_time = None

    async def recv(self) -> VideoFrame:
        if self._latest_frame is None:
            await self._first_frame_event.wait()
            self._start_time = time.time()
            
        # Critical: ALWAYS yield to the event loop so we don't lock the WebRTC connection!
        await asyncio.sleep(0)
        
        now = time.time() - self._start_time
        expected_pts = int(now * self._fps)
        
        if self._pts > expected_pts:
            # We are ahead of schedule, sleep until it's time
            sleep_time = (self._pts / self._fps) - now
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)

        frame_array = self._latest_frame.copy()
        vf = VideoFrame.from_ndarray(frame_array, format="bgr24")
        vf.pts = self._pts
        vf.time_base = fractions.Fraction(1, self._fps)
        self._pts += 1
        return vf

    def update_frame(self, frame: np.ndarray) -> None:
        self._latest_frame = frame
        if not self._first_frame_event.is_set():
            self._first_frame_event.set()

class VideoRecorder:
    def __init__(self, config: SegStreamConfig) -> None:
        self._config = config
        self._media_recorder: MediaRecorder | None = None
        self._proxy_track: ProxyVideoStreamTrack | None = None
        self.is_recording = False
        self._frame_count = 0
        self._output_path = ""
        self._start_time: Optional[float] = None

    def write_frame(self, frame: np.ndarray) -> None:
        if self.is_recording and self._proxy_track:
            self._proxy_track.update_frame(frame)
            self._frame_count += 1

    async def start_async(self, width: int, height: int, audio_track: Optional[MediaStreamTrack] = None) -> str:
        if self.is_recording:
            raise RuntimeError("Recording already in progress. Call stop() first.")

        out_dir = Path(self._config.output_dir).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"segstream_{ts}.{self._config.output_format}"
        self._output_path = str(out_dir / filename)
        
        self._media_recorder = MediaRecorder(self._output_path)
        self._proxy_track = ProxyVideoStreamTrack(fps=self._config.output_fps)
        
        self._media_recorder.addTrack(self._proxy_track)
        if audio_track:
            self._media_recorder.addTrack(audio_track)
            
        await self._media_recorder.start()
        
        self.is_recording = True
        self._start_time = time.monotonic()
        self._frame_count = 0
        logger.info("Recording started (with audio) → %s", self._output_path)
        return self._output_path


    async def stop_async(self) -> str:
        if not self.is_recording or self._media_recorder is None:
            raise RuntimeError("No recording in progress.")
            
        await self._media_recorder.stop()
        self._media_recorder = None
        
        path = self._output_path or ""
        elapsed = time.monotonic() - (self._start_time or 0)
        logger.info("Recording stopped → %s (%d frames, %.1f s)", path, self._frame_count, elapsed)
        
        self.is_recording = False
        self._proxy_track = None
        self._start_time = None
        self._output_path = None
        return path

    @property
    def duration(self) -> float:
        if self._start_time is None:
            return 0.0
        return time.monotonic() - self._start_time

    @property
    def frame_count(self) -> int:
        return self._frame_count

    @property
    def output_path(self) -> str | None:
        return self._output_path
