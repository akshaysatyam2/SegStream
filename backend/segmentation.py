"""
SegStream Person Segmentation Module
======================================

Runs YOLOv11-seg (or compatible YOLO ONNX model) inference to produce a binary
person mask from a webcam frame.  The mask is used downstream by the compositor
to alpha-blend the segmented person onto the screen recording.

Pipeline:
    1. **Preprocess** — resize to model input, normalise to [0, 1], HWC→CHW→NCHW.
    2. **Infer** — run the ONNX session.
    3. **Postprocess** — decode YOLO seg outputs (bounding boxes + proto masks),
       apply confidence/NMS filtering, select person class (COCO class 0),
       produce a full-resolution binary mask.

Author: Akshay
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .config import SegStreamConfig
from .providers import detect_execution_provider

logger = logging.getLogger(__name__)

# COCO class ID for "person".
_PERSON_CLASS_ID: int = 0

# Number of mask prototype coefficients output by YOLO-seg models.
_MASK_COEFFS: int = 32


class PersonSegmenter:
    """Real-time person segmentation powered by YOLO-seg ONNX inference.

    Parameters
    ----------
    config:
        Application-wide configuration (model path, input size, thresholds).

    Attributes
    ----------
    session : onnxruntime.InferenceSession | None
        The loaded ONNX inference session, or ``None`` if the model file
        was missing at construction time.

    Author: Akshay
    """

    def __init__(self, config: SegStreamConfig) -> None:
        self._config = config
        self._input_w, self._input_h = config.input_size  # (640, 640)
        self._conf_thresh = config.confidence_threshold

        self.session: Any | None = None  # ort.InferenceSession
        self._input_name: str = ""
        self._output_names: list[str] = []

        self._load_model()

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------
    def _load_model(self) -> None:
        """Load the ONNX model and create an inference session.

        If the model file does not exist, a warning is logged and the
        segmenter operates in *passthrough* mode (returns empty masks).

        Author: Akshay
        """
        model_path = Path(self._config.model_path)

        if not model_path.exists():
            logger.warning(
                "Model file not found at '%s'. Segmenter will return empty masks. "
                "Download a YOLO-seg ONNX model and place it at this path.",
                model_path,
            )
            return

        try:
            import onnxruntime as ort  # noqa: WPS433

            provider_name, provider_opts = detect_execution_provider()

            self.session = ort.InferenceSession(
                str(model_path),
                providers=[(provider_name, provider_opts)],
            )

            self._input_name = self.session.get_inputs()[0].name
            self._output_names = [o.name for o in self.session.get_outputs()]

            logger.info(
                "Loaded ONNX model '%s' — inputs: [%s], outputs: %s",
                model_path,
                self._input_name,
                self._output_names,
            )
        except Exception:
            logger.exception("Failed to load ONNX model from '%s'", model_path)
            self.session = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def segment(self, frame: np.ndarray) -> np.ndarray:
        """Run YOLO segmentation on a BGR frame.

        Parameters
        ----------
        frame:
            Input image in BGR colour order (OpenCV default), shape ``(H, W, 3)``.

        Returns
        -------
        np.ndarray
            Binary mask of shape ``(H, W)`` with dtype ``uint8``,
            where ``255`` = person pixel, ``0`` = background.

        Author: Akshay
        """
        orig_h, orig_w = frame.shape[:2]

        if self.session is None:
            # Passthrough — no model loaded, return empty mask.
            return np.zeros((orig_h, orig_w), dtype=np.uint8)

        t0 = time.perf_counter()

        # 1. Preprocess ────────────────────────────────────────────────────
        blob = self._preprocess(frame)

        # 2. Infer ─────────────────────────────────────────────────────────
        outputs = self.session.run(self._output_names, {self._input_name: blob})

        # 3. Postprocess ───────────────────────────────────────────────────
        mask = self._postprocess(outputs, orig_w, orig_h)

        dt = (time.perf_counter() - t0) * 1000
        logger.debug("Segmentation took %.1f ms", dt)

        return mask

    def extract_person(
        self, frame: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """Extract the person with a transparent background.

        Parameters
        ----------
        frame:
            BGR input image, shape ``(H, W, 3)``.

        Returns
        -------
        tuple[np.ndarray, np.ndarray]
            ``(person_rgba, mask)`` where *person_rgba* has shape ``(H, W, 4)``
            (BGRA with transparent background) and *mask* has shape ``(H, W)``
            with ``uint8`` values in {0, 255}.

        Author: Akshay
        """
        mask = self.segment(frame)

        # Build BGRA image with alpha = mask.
        bgra = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
        bgra[mask == 0] = [0, 0, 0, 0]  # Zero out background completely
        bgra[:, :, 3] = mask  # 255 where person, 0 elsewhere

        return bgra, mask

    # ------------------------------------------------------------------
    # Preprocessing
    # ------------------------------------------------------------------
    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize, normalise, and reorder axes for YOLO ONNX input.

        Returns an NCHW ``float32`` blob of shape ``(1, 3, H, W)``.

        Author: Akshay
        """
        # Resize with letterboxing-free direct resize for simplicity.
        resized = cv2.resize(
            frame, (self._input_w, self._input_h), interpolation=cv2.INTER_LINEAR
        )

        # BGR → RGB, uint8 → float32 [0, 1].
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

        # HWC → CHW → NCHW.
        chw = np.transpose(rgb, (2, 0, 1))
        nchw = np.expand_dims(chw, axis=0)  # (1, 3, H, W)

        return nchw

    # ------------------------------------------------------------------
    # Postprocessing
    # ------------------------------------------------------------------
    def _postprocess(
        self,
        outputs: list[np.ndarray],
        orig_w: int,
        orig_h: int,
    ) -> np.ndarray:
        """Decode YOLO-seg outputs into a binary person mask.

        YOLO-seg ONNX models typically have two outputs:
            * ``output0``  — shape ``(1, num_predictions, 4+num_classes+32)``
              containing bounding-box coords, class scores, and mask coefficients.
            * ``output1``  — shape ``(1, 32, mask_h, mask_w)``
              containing the prototype masks.

        We parse *output0* to find high-confidence person detections, apply
        NMS, project each detection's 32 mask coefficients through *output1*
        to obtain per-instance masks, then merge them into a single binary mask
        and resize to original frame dimensions.

        Author: Akshay
        """
        # Guard: unexpected number of outputs — return empty mask.
        if len(outputs) < 2:
            logger.warning(
                "Model returned %d outputs (expected ≥2). Returning empty mask.",
                len(outputs),
            )
            return np.zeros((orig_h, orig_w), dtype=np.uint8)

        preds = outputs[0]   # (1, num_preds, 4+nc+32)
        protos = outputs[1]  # (1, 32, mask_h, mask_w)

        # Transpose predictions: YOLO outputs (1, channels, num_preds) in some
        # model exports → we normalise to (num_preds, channels).
        if preds.ndim == 3:
            # Some YOLO exports: (1, 4+nc+32, num_preds)
            if preds.shape[1] < preds.shape[2]:
                preds = np.transpose(preds, (0, 2, 1))
            preds = preds[0]  # (num_preds, channels)

        protos = protos[0]  # (32, mask_h, mask_w)
        mask_h, mask_w = protos.shape[1], protos.shape[2]

        # Split columns: [cx, cy, w, h, class_scores..., mask_coeffs(32)]
        num_channels = preds.shape[1]
        num_classes = num_channels - 4 - _MASK_COEFFS

        if num_classes <= 0:
            logger.warning("Unexpected prediction shape %s", preds.shape)
            return np.zeros((orig_h, orig_w), dtype=np.uint8)

        boxes_xywh = preds[:, :4]                           # (N, 4)
        class_scores = preds[:, 4 : 4 + num_classes]        # (N, nc)
        mask_coeffs = preds[:, 4 + num_classes:]             # (N, 32)

        # Per-detection best class and score.
        class_ids = np.argmax(class_scores, axis=1)          # (N,)
        confidences = np.max(class_scores, axis=1)           # (N,)

        # Filter: keep only person class above confidence threshold.
        keep = (class_ids == _PERSON_CLASS_ID) & (confidences >= self._conf_thresh)

        if not np.any(keep):
            return np.zeros((orig_h, orig_w), dtype=np.uint8)

        kept_boxes = boxes_xywh[keep]
        kept_scores = confidences[keep]
        kept_coeffs = mask_coeffs[keep]

        # Convert centre-form (cx, cy, w, h) → corner-form (x1, y1, x2, y2)
        # for OpenCV NMS — coordinates are in *model input* pixel space.
        x1 = kept_boxes[:, 0] - kept_boxes[:, 2] / 2
        y1 = kept_boxes[:, 1] - kept_boxes[:, 3] / 2
        x2 = kept_boxes[:, 0] + kept_boxes[:, 2] / 2
        y2 = kept_boxes[:, 1] + kept_boxes[:, 3] / 2
        xyxy = np.stack([x1, y1, x2, y2], axis=1)

        # NMS via OpenCV.
        indices = cv2.dnn.NMSBoxes(
            bboxes=xyxy.tolist(),
            scores=kept_scores.tolist(),
            score_threshold=self._conf_thresh,
            nms_threshold=0.45,
        )

        if len(indices) == 0:
            return np.zeros((orig_h, orig_w), dtype=np.uint8)

        # Flatten indices (OpenCV may return column vector).
        if isinstance(indices, np.ndarray):
            indices = indices.flatten()

        # ── Build merged instance mask ────────────────────────────────────
        merged_mask = np.zeros((mask_h, mask_w), dtype=np.float32)

        for idx in indices:
            coeffs = kept_coeffs[idx]  # (32,)
            # Matrix multiply: coeffs · protos → (mask_h, mask_w)
            # Optimized: flatten spatial dims to use fast BLAS matrix multiplication
            protos_flat = protos.reshape(protos.shape[0], -1)
            inst_mask = (coeffs @ protos_flat).reshape(mask_h, mask_w)
            # Sigmoid activation.
            inst_mask = 1.0 / (1.0 + np.exp(-inst_mask))

            # Crop mask to bounding box region (improves quality).
            bx1 = int(max(0, x1[idx] / self._input_w * mask_w))
            by1 = int(max(0, y1[idx] / self._input_h * mask_h))
            bx2 = int(min(mask_w, x2[idx] / self._input_w * mask_w))
            by2 = int(min(mask_h, y2[idx] / self._input_h * mask_h))

            cropped = np.zeros_like(inst_mask)
            cropped[by1:by2, bx1:bx2] = inst_mask[by1:by2, bx1:bx2]

            merged_mask = np.maximum(merged_mask, cropped)

        # Threshold + resize to original frame dimensions.
        binary = (merged_mask > 0.5).astype(np.uint8) * 255
        full_mask = cv2.resize(
            binary, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR
        )

        # Re-threshold after resize to keep mask binary.
        _, full_mask = cv2.threshold(full_mask, 127, 255, cv2.THRESH_BINARY)

        return full_mask.astype(np.uint8)
