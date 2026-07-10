"""
SegStream Frame Compositor
===========================

Alpha-blends the segmented person (with transparent background) onto the
screen recording frame.  Supports configurable overlay position, size, opacity,
and shape masking (rectangle / circle / rounded rectangle).

All heavy lifting is done with vectorised NumPy/OpenCV operations to hit the
30-60 FPS target on modest hardware.

Author: Akshay
"""

from __future__ import annotations

import logging
from typing import Any

import cv2
import numpy as np

from .config import SegStreamConfig

logger = logging.getLogger(__name__)


class FrameCompositor:
    """Composites a segmented person overlay onto a screen recording frame.

    Parameters
    ----------
    config:
        Application-wide configuration (overlay position, shape, opacity).

    Author: Akshay
    """

    def __init__(self, config: SegStreamConfig) -> None:
        self._config = config

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def composite(
        self,
        screen_frame: np.ndarray,
        person_rgba: np.ndarray,
        mask: np.ndarray,
        overlay_params: dict[str, Any] | None = None,
    ) -> np.ndarray:
        """Composite the segmented person onto the screen recording.

        Parameters
        ----------
        screen_frame:
            Background image in BGR, shape ``(H, W, 3)``.
        person_rgba:
            Foreground person image in BGRA, shape ``(h, w, 4)``.
        mask:
            Binary mask ``(h, w)`` with ``uint8`` values in {0, 255}.
        overlay_params:
            Optional dict overriding default overlay placement.  Accepted
            keys: ``x``, ``y``, ``width``, ``height``, ``opacity``, ``shape``.

        Returns
        -------
        np.ndarray
            The composited BGR frame, same dimensions as *screen_frame*.

        Author: Akshay
        """
        # Resolve overlay parameters (runtime overrides > config defaults).
        params = self._resolve_params(overlay_params)

        ox: int = params["x"]
        oy: int = params["y"]
        ow: int = params["width"]
        oh: int = params["height"]
        opacity: float = params["opacity"]
        shape: str = params["shape"]

        out = screen_frame.copy()
        sh, sw = out.shape[:2]

        # Resize person + mask to overlay dimensions.
        person_resized = cv2.resize(person_rgba, (ow, oh), interpolation=cv2.INTER_LINEAR)
        mask_resized = cv2.resize(mask, (ow, oh), interpolation=cv2.INTER_LINEAR)

        # Re-threshold after resize.
        _, mask_resized = cv2.threshold(mask_resized, 127, 255, cv2.THRESH_BINARY)

        # Apply shape mask (circle, rounded rectangle, etc.).
        shape_mask = self.apply_shape_mask(mask_resized, shape)

        # Compute alpha channel: combine person mask with shape mask and opacity.
        # Both masks are uint8 in {0, 255}; normalise to [0.0, 1.0].
        alpha = (shape_mask.astype(np.float32) / 255.0) * opacity  # (oh, ow)

        # Clamp overlay region to screen boundaries.
        # Source (person overlay) coordinates.
        sx_start = max(0, -ox)
        sy_start = max(0, -oy)
        sx_end = min(ow, sw - ox)
        sy_end = min(oh, sh - oy)

        # Destination (screen) coordinates.
        dx_start = max(0, ox)
        dy_start = max(0, oy)
        dx_end = dx_start + (sx_end - sx_start)
        dy_end = dy_start + (sy_end - sy_start)

        # Early exit if the overlay is entirely off-screen.
        if sx_start >= sx_end or sy_start >= sy_end:
            return out

        # Slice the relevant regions.
        person_roi = person_resized[sy_start:sy_end, sx_start:sx_end, :3]  # BGR
        alpha_roi = alpha[sy_start:sy_end, sx_start:sx_end]                # (h, w)
        screen_roi = out[dy_start:dy_end, dx_start:dx_end]                 # BGR

        # ── Vectorised alpha blending ─────────────────────────────────────
        # out = person * alpha + screen * (1 - alpha)
        alpha_3 = alpha_roi[:, :, np.newaxis]  # (h, w, 1) — broadcasts over BGR
        blended = (
            person_roi.astype(np.float32) * alpha_3
            + screen_roi.astype(np.float32) * (1.0 - alpha_3)
        )
        out[dy_start:dy_end, dx_start:dx_end] = blended.astype(np.uint8)

        return out

    # ------------------------------------------------------------------
    # Shape masking
    # ------------------------------------------------------------------
    def apply_shape_mask(self, mask: np.ndarray, shape: str) -> np.ndarray:
        """Apply a geometric shape constraint to the person mask.

        Parameters
        ----------
        mask:
            Input binary mask ``(H, W)`` with dtype ``uint8``.
        shape:
            One of ``"rectangle"``, ``"circle"``, or ``"rounded"``.

        Returns
        -------
        np.ndarray
            Masked result ``(H, W)``, dtype ``uint8``.

        Author: Akshay
        """
        h, w = mask.shape[:2]

        if shape == "rectangle":
            # No additional clipping needed — the overlay region itself is
            # already a rectangle.
            return mask

        if shape == "circle":
            # Elliptical mask inscribed in the overlay rectangle.
            ellipse_mask = np.zeros((h, w), dtype=np.uint8)
            centre = (w // 2, h // 2)
            axes = (w // 2, h // 2)
            cv2.ellipse(ellipse_mask, centre, axes, 0, 0, 360, 255, -1)
            return cv2.bitwise_and(mask, ellipse_mask)

        if shape == "rounded":
            # Rounded rectangle with a corner radius proportional to the
            # smaller dimension.
            radius = int(min(w, h) * 0.15)
            rounded_mask = self._rounded_rect_mask(w, h, radius)
            return cv2.bitwise_and(mask, rounded_mask)

        logger.warning("Unknown overlay shape '%s'; treating as rectangle.", shape)
        return mask

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_params(
        self, overrides: dict[str, Any] | None
    ) -> dict[str, Any]:
        """Merge config defaults with optional runtime overrides.

        Author: Akshay
        """
        defaults: dict[str, Any] = {
            "x": self._config.overlay_x,
            "y": self._config.overlay_y,
            "width": self._config.overlay_width,
            "height": self._config.overlay_height,
            "opacity": self._config.overlay_opacity,
            "shape": self._config.overlay_shape,
        }
        if overrides:
            defaults.update(overrides)
        return defaults

    @staticmethod
    def _rounded_rect_mask(w: int, h: int, radius: int) -> np.ndarray:
        """Create a filled rounded-rectangle mask of size ``(h, w)``.

        Author: Akshay
        """
        mask = np.zeros((h, w), dtype=np.uint8)
        r = min(radius, w // 2, h // 2)

        # Fill the interior rectangles.
        cv2.rectangle(mask, (r, 0), (w - r, h), 255, -1)
        cv2.rectangle(mask, (0, r), (w, h - r), 255, -1)

        # Fill the four corner circles.
        cv2.circle(mask, (r, r), r, 255, -1)
        cv2.circle(mask, (w - r, r), r, 255, -1)
        cv2.circle(mask, (r, h - r), r, 255, -1)
        cv2.circle(mask, (w - r, h - r), r, 255, -1)

        return mask
