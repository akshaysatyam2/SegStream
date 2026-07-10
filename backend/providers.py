"""
SegStream Execution Provider Detection
========================================

Detects the best available ONNX Runtime execution provider at startup so that
inference automatically uses GPU acceleration when present and falls back to
CPU otherwise.

Fallback hierarchy:
    1. **CUDAExecutionProvider** — NVIDIA GPU via CUDA/cuDNN.
    2. **OpenVINOExecutionProvider** — Intel CPU/GPU/VPU via OpenVINO.
    3. **CPUExecutionProvider** — Universal fallback (always available).

Author: Akshay
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def detect_execution_provider() -> tuple[str, dict[str, Any]]:
    """Detect the best available ONNX Runtime execution provider.

    Iterates through the preferred provider list and returns the first one
    that is actually registered with the installed ``onnxruntime`` build.

    Returns
    -------
    tuple[str, dict[str, Any]]
        A 2-tuple of ``(provider_name, provider_options)``.
        *provider_options* is an empty dict for CPU, and may contain
        device/memory settings for GPU providers.

    Examples
    --------
    >>> provider, opts = detect_execution_provider()
    >>> session = ort.InferenceSession(model_path, providers=[(provider, opts)])

    Author: Akshay
    """
    try:
        import onnxruntime as ort  # noqa: WPS433
    except ImportError:
        logger.error(
            "onnxruntime is not installed. Install it with: "
            "pip install onnxruntime (or onnxruntime-gpu for CUDA support)"
        )
        raise

    available: list[str] = ort.get_available_providers()
    logger.debug("ONNX Runtime available providers: %s", available)

    # ── Candidate list (highest priority first) ──────────────────────────
    candidates: list[tuple[str, dict[str, Any]]] = [
        (
            "CUDAExecutionProvider",
            {
                "device_id": 0,
                "arena_extend_strategy": "kSameAsRequested",
                "cudnn_conv_algo_search": "DEFAULT",
            },
        ),
        (
            "OpenVINOExecutionProvider",
            {
                "device_type": "CPU",  # can be GPU, MYRIAD, etc.
            },
        ),
        (
            "CPUExecutionProvider",
            {},
        ),
    ]

    for name, opts in candidates:
        if name in available:
            logger.info(
                "Selected ONNX execution provider: %s (options=%s)", name, opts
            )
            return name, opts

    # This branch should never be reached — CPUExecutionProvider is always
    # present — but handle it defensively just in case.
    logger.warning(
        "No known execution provider found in %s; defaulting to CPU", available
    )
    return "CPUExecutionProvider", {}
