"""
SegStream Backend — Lightweight OBS Alternative
================================================

Python backend for real-time person segmentation and video compositing.
Receives screen + webcam streams via WebRTC, runs YOLO segmentation on the
webcam feed, composites the segmented person onto the screen recording,
and outputs to local file or RTSP stream.

Author: Akshay
Version: 0.1.0
"""

__version__ = '0.1.0'
__author__ = 'Akshay'

# Expose core classes at package level for convenient imports.
# Usage: from backend import SegStreamConfig, PersonSegmenter, ...
from .config import SegStreamConfig
from .providers import detect_execution_provider
from .segmentation import PersonSegmenter
from .compositor import FrameCompositor
from .recorder import VideoRecorder
from .streamer import RTSPStreamer

__all__ = [
    'SegStreamConfig',
    'detect_execution_provider',
    'PersonSegmenter',
    'FrameCompositor',
    'VideoRecorder',
    'RTSPStreamer',
]
