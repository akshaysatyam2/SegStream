"""
SegStream Configuration Module
===============================

Central configuration for the SegStream backend. Uses a Python dataclass
with sensible defaults, environment variable overrides, and optional JSON
config file loading.

Author: Akshay
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field, fields, asdict
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment variable prefix — all SegStream env vars start with this.
# Example: SEGSTREAM_HOST=0.0.0.0, SEGSTREAM_MODEL_PATH=models/yolo.onnx
# ---------------------------------------------------------------------------
_ENV_PREFIX = "SEGSTREAM_"


@dataclass
class SegStreamConfig:
    """Centralised runtime configuration for every SegStream subsystem.

    **Resolution order** (later wins):
        1. Dataclass defaults defined below.
        2. Values loaded from a JSON config file (``from_json``).
        3. Environment variables prefixed with ``SEGSTREAM_``.
        4. Explicit keyword arguments passed to the constructor.

    Examples
    --------
    >>> cfg = SegStreamConfig()                         # all defaults
    >>> cfg = SegStreamConfig.from_json("config.json")  # from file
    >>> cfg = SegStreamConfig(host="127.0.0.1")         # override host

    Author: Akshay
    """

    # ── Server ────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8080

    # ── Model ─────────────────────────────────────────────────────────────
    model_path: str = "models/yolo26n-seg.onnx"
    input_size: tuple[int, int] = (640, 640)
    confidence_threshold: float = 0.5

    # ── Compositing ───────────────────────────────────────────────────────
    overlay_x: int = 20
    overlay_y: int = 20
    overlay_width: int = 320
    overlay_height: int = 240
    overlay_opacity: float = 1.0
    overlay_shape: str = "rounded"  # rectangle | circle | rounded

    # ── Recording ─────────────────────────────────────────────────────────
    output_dir: str = "recordings"
    output_format: str = "mp4"
    output_fps: int = 30
    output_codec: str = "mp4v"

    # ── RTSP Streaming ────────────────────────────────────────────────────
    rtsp_enabled: bool = False
    rtsp_url: str = "rtsp://localhost:8554/segstream"

    # ── Performance ───────────────────────────────────────────────────────
    target_fps: int = 30
    max_workers: int = 2

    # ------------------------------------------------------------------
    # Post-init: apply environment variable overrides
    # ------------------------------------------------------------------
    def __post_init__(self) -> None:
        """Apply environment variable overrides after dataclass init.

        For every field in the dataclass, we look for an environment variable
        named ``SEGSTREAM_<FIELD_NAME_UPPER>``.  If present, its value is
        coerced to the field's type and set on the instance.
        """
        for f in fields(self):
            env_key = f"{_ENV_PREFIX}{f.name.upper()}"
            env_val = os.environ.get(env_key)
            if env_val is not None:
                try:
                    coerced = self._coerce(env_val, f.type)
                    object.__setattr__(self, f.name, coerced)
                    logger.debug("Config override from env: %s = %r", env_key, coerced)
                except (ValueError, TypeError) as exc:
                    logger.warning(
                        "Ignoring invalid env var %s=%r — %s", env_key, env_val, exc
                    )

    # ------------------------------------------------------------------
    # Class-level factory: load from JSON file
    # ------------------------------------------------------------------
    @classmethod
    def from_json(cls, path: str | Path) -> SegStreamConfig:
        """Create a config instance from a JSON file, then apply env overrides.

        Parameters
        ----------
        path:
            Path to a JSON file whose keys match dataclass field names.

        Returns
        -------
        SegStreamConfig
            A fully-initialised configuration instance.

        Raises
        ------
        FileNotFoundError
            If *path* does not exist.
        json.JSONDecodeError
            If the file contains invalid JSON.

        Author: Akshay
        """
        path = Path(path)
        logger.info("Loading config from %s", path)

        with path.open("r", encoding="utf-8") as fh:
            data: dict[str, Any] = json.load(fh)

        # Only keep keys that are valid field names so unknown keys don't
        # crash the constructor.
        valid_keys = {f.name for f in fields(cls)}
        filtered = {k: v for k, v in data.items() if k in valid_keys}

        unknown = set(data.keys()) - valid_keys
        if unknown:
            logger.warning("Ignoring unknown config keys: %s", unknown)

        # Handle `input_size` — accept a list from JSON and convert to tuple.
        if "input_size" in filtered and isinstance(filtered["input_size"], list):
            filtered["input_size"] = tuple(filtered["input_size"])

        return cls(**filtered)

    # ------------------------------------------------------------------
    # Serialisation helper
    # ------------------------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        """Return configuration as a plain ``dict`` (JSON-serialisable).

        Author: Akshay
        """
        data = asdict(self)
        # Convert tuple → list for JSON compatibility.
        if isinstance(data.get("input_size"), tuple):
            data["input_size"] = list(data["input_size"])
        return data

    def to_json(self, path: str | Path) -> None:
        """Persist current config to a JSON file.

        Author: Akshay
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2)
        logger.info("Config saved to %s", path)

    # ------------------------------------------------------------------
    # Runtime update helper (used by the /api/config endpoint)
    # ------------------------------------------------------------------
    def update(self, overrides: dict[str, Any]) -> dict[str, Any]:
        """Apply a dictionary of overrides to mutable runtime fields.

        Returns the dict of fields that were actually changed (with new values).

        Author: Akshay
        """
        valid_keys = {f.name for f in fields(self)}
        changed: dict[str, Any] = {}

        for key, value in overrides.items():
            if key not in valid_keys:
                logger.warning("Ignoring unknown config key: %s", key)
                continue
            old = getattr(self, key)
            if old != value:
                object.__setattr__(self, key, value)
                changed[key] = value
                logger.info("Config updated: %s = %r (was %r)", key, value, old)

        return changed

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _coerce(value: str, type_hint: str) -> Any:
        """Coerce a string *value* from an env var to the target *type_hint*.

        Handles: str, int, float, bool, tuple[int, int].
        """
        # The type_hint comes as a string from dataclass field metadata.
        if type_hint in ("str", "str | Path"):
            return value
        if type_hint in ("int",):
            return int(value)
        if type_hint in ("float",):
            return float(value)
        if type_hint in ("bool",):
            return value.lower() in ("1", "true", "yes", "on")
        if "tuple" in str(type_hint):
            # Expect comma-separated ints, e.g. "640,640"
            parts = value.replace("(", "").replace(")", "").split(",")
            return tuple(int(p.strip()) for p in parts)
        # Fallback — return raw string.
        return value

    # ------------------------------------------------------------------
    # Pretty printing
    # ------------------------------------------------------------------
    def __repr__(self) -> str:  # pragma: no cover
        lines = [f"  {f.name}={getattr(self, f.name)!r}" for f in fields(self)]
        return "SegStreamConfig(\n" + ",\n".join(lines) + "\n)"
