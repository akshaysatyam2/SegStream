# SegStream - Development Notes & History

## History & Issues Resolved
- **OpenCV VideoWriter Dropping Frames**: The initial implementation used OpenCV `VideoWriter`. It rigidly expected a fixed resolution; when the screen resolution didn't exactly match the hardcoded values, OpenCV silently dropped all frames.
- **Missing Audio in OpenCV**: OpenCV cannot mux audio. Recorded MP4 files were completely silent.
- **WebRTC Network Disconnects**: Running YOLOv8 segmentation on the main CPU was taking ~8 seconds per frame. The resulting 100% CPU utilization starved the Python `asyncio` event loop, preventing WebRTC `ICE` heartbeats from sending, which led to the browser forcibly disconnecting the peer connection. Fixed by adding a minimum `100ms` sleep in the processing loop (`server.py`).
- **Unreadable MP4s with PyAV**: When migrating to PyAV/aiortc `MediaRecorder` for audio support, the AI was producing video at ~0.1 FPS. When these sparse frames were written with standard 30 FPS Presentation Timestamps (PTS), it produced a completely corrupted, unreadable MP4 where the audio was 30+ seconds long but the video was a fraction of a second.
- **Event Loop Lockups in Proxy Track**: An early attempt to pace the proxy track without yielding blocked the async event loop permanently.

## Upgrades Implemented
1. **PyAV MediaRecorder**: Replaced OpenCV entirely. Native Python bindings to FFmpeg allow for perfect multiplexing of both the AI composited video and the WebRTC microphone/system audio track into a single MP4.
2. **Dynamic Resolution Handling**: The backend now infers the exact dimensions of the screen stream on the fly rather than hardcoding it, preventing dropped frames from dimension mismatches.
3. **Robust ProxyVideoStreamTrack**: Rewritten to act as a buffer between the slow AI inference and the fast MP4 encoder. It holds the latest frame and duplicates it out at exactly 30 FPS (yielding continuously to the event loop), ensuring a valid, perfectly synced, unbroken MP4 file regardless of how slow YOLO inference gets.
4. **UI-to-Backend Sync**: The frontend React app now actively pushes the overlay's X/Y coordinates and dimensions to the backend via `/api/config`, ensuring the final recorded video looks exactly like the user's live preview.
5. **ONNX Export**: Switched from PyTorch (`.pt`) to ONNX (`.onnx`) for the YOLO segmentation model to eliminate the heavy PyTorch dependency from the runtime environment.

## TODO / Next Steps
- [ ] **Inference Optimization**: YOLOv8 CPU execution is currently taking too long per frame (resulting in very low effective FPS). Need to investigate ONNX Execution Providers (e.g., CUDA, OpenVINO, CoreML) to drastically speed up `extract_person()`.
- [ ] **Documentation**: Write comprehensive `README.md` and module docstrings documenting the new `aiortc` architecture.
- [ ] **UI Polish**: The frontend handles drag-and-drop overlay positioning perfectly, but we could improve the visual loading states and error handling if WebRTC disconnects gracefully.
- [ ] **Recording Directory Management**: Ensure old recordings are cleaned up or managed via the frontend UI.
