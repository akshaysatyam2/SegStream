"""
SegStream RTSP Streamer
========================

Pushes composited frames to an RTSP server by piping raw video data into an
FFmpeg subprocess.  This allows third-party players (VLC, OBS, etc.) to
consume the SegStream output as a live stream.

The streamer expects an external RTSP server (e.g. MediaMTX / rtsp-simple-server)
to be running at the configured URL.  If FFmpeg is not installed, the streamer
logs a warning and operates as a no-op.

Author: Akshay
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import threading
from typing import Optional

import numpy as np

from .config import SegStreamConfig

logger = logging.getLogger(__name__)


class RTSPStreamer:
    """Streams composited frames to an RTSP endpoint via FFmpeg.

    Parameters
    ----------
    config:
        Application-wide configuration (``rtsp_enabled``, ``rtsp_url``, etc.).

    Author: Akshay
    """

    def __init__(self, config: SegStreamConfig) -> None:
        self._config = config
        self._lock = threading.Lock()

        self._process: Optional[subprocess.Popen] = None
        self._width: int = 0
        self._height: int = 0
        self._ffmpeg_path: Optional[str] = self._find_ffmpeg()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def start(self, width: int, height: int) -> None:
        """Start the RTSP stream output.

        Launches an FFmpeg subprocess that reads raw BGR24 frames from
        ``stdin`` and re-encodes to H.264 for RTSP output.

        Parameters
        ----------
        width:
            Frame width in pixels.
        height:
            Frame height in pixels.

        Raises
        ------
        RuntimeError
            If FFmpeg is not installed or a stream is already active.

        Author: Akshay
        """
        with self._lock:
            if self._process is not None:
                raise RuntimeError("RTSP stream already active. Call stop() first.")

            if self._ffmpeg_path is None:
                raise RuntimeError(
                    "FFmpeg not found on PATH. Install FFmpeg to enable RTSP streaming."
                )

            self._width = width
            self._height = height

            cmd = [
                self._ffmpeg_path,
                "-y",                            # overwrite output
                "-f", "rawvideo",                 # input format
                "-vcodec", "rawvideo",
                "-pix_fmt", "bgr24",              # OpenCV default pixel format
                "-s", f"{width}x{height}",        # frame size
                "-r", str(self._config.output_fps),  # frame rate
                "-i", "-",                        # read from stdin
                "-c:v", "libx264",                # H.264 encoding
                "-preset", "ultrafast",           # minimal latency
                "-tune", "zerolatency",
                "-pix_fmt", "yuv420p",
                "-f", "rtsp",                     # output format
                "-rtsp_transport", "tcp",
                self._config.rtsp_url,
            ]

            logger.info(
                "Starting RTSP stream → %s (%dx%d @ %d FPS)",
                self._config.rtsp_url,
                width,
                height,
                self._config.output_fps,
            )
            logger.debug("FFmpeg command: %s", " ".join(cmd))

            try:
                self._process = subprocess.Popen(
                    cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
            except OSError as exc:
                logger.error("Failed to start FFmpeg: %s", exc)
                self._process = None
                raise RuntimeError(f"Failed to start FFmpeg: {exc}") from exc

    def push_frame(self, frame: np.ndarray) -> None:
        """Push a composited BGR frame to the RTSP stream.

        This method is a no-op if the stream has not been started.

        Parameters
        ----------
        frame:
            BGR image of shape ``(H, W, 3)`` with dtype ``uint8``.

        Author: Akshay
        """
        with self._lock:
            if self._process is None or self._process.stdin is None:
                return

            try:
                self._process.stdin.write(frame.tobytes())
            except BrokenPipeError:
                logger.warning("FFmpeg pipe broken — RTSP stream may have stopped.")
                self._cleanup_process()

    def stop(self) -> None:
        """Stop the RTSP stream and terminate FFmpeg.

        Author: Akshay
        """
        with self._lock:
            if self._process is None:
                logger.debug("No RTSP stream to stop.")
                return

            logger.info("Stopping RTSP stream → %s", self._config.rtsp_url)
            self._cleanup_process()

    # ------------------------------------------------------------------
    # Read-only properties
    # ------------------------------------------------------------------
    @property
    def is_streaming(self) -> bool:
        """``True`` while the RTSP stream subprocess is running.

        Author: Akshay
        """
        with self._lock:
            return self._process is not None and self._process.poll() is None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _cleanup_process(self) -> None:
        """Gracefully terminate the FFmpeg subprocess.

        Author: Akshay
        """
        if self._process is None:
            return

        try:
            if self._process.stdin:
                self._process.stdin.close()
        except OSError:
            pass

        try:
            self._process.terminate()
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning("FFmpeg did not exit in time — sending SIGKILL.")
            self._process.kill()
            self._process.wait(timeout=2)
        except OSError:
            pass

        # Log any FFmpeg stderr for debugging.
        if self._process.stderr:
            try:
                stderr_output = self._process.stderr.read()
                if stderr_output:
                    logger.debug(
                        "FFmpeg stderr:\n%s", stderr_output.decode(errors="replace")
                    )
            except OSError:
                pass

        self._process = None
        logger.info("RTSP stream stopped.")

    @staticmethod
    def _find_ffmpeg() -> Optional[str]:
        """Locate the ``ffmpeg`` binary on the system PATH.

        Returns
        -------
        str | None
            Absolute path to ``ffmpeg``, or ``None`` if not found.

        Author: Akshay
        """
        path = shutil.which("ffmpeg")
        if path:
            logger.debug("Found FFmpeg at %s", path)
        else:
            logger.warning(
                "FFmpeg not found on PATH. RTSP streaming will be unavailable."
            )
        return path
