# SegStream

A lightweight, open-source alternative to OBS Studio — built for developers who want real-time AI background removal without a green screen.

SegStream captures your screen and webcam simultaneously, runs YOLO segmentation on the webcam feed to extract your body, and composites it onto the screen recording in real-time. No chroma key. No bulky software. Just clean segmentation.

---

## What It Does

- **Screen + Webcam Recording** — Captures both streams via browser APIs (`getDisplayMedia` + `getUserMedia`).
- **Real-Time Background Removal** — Runs YOLO26 Nano Segmentation (`yolo26n-seg`) on your webcam feed. Your background disappears; you stay.
- **Live Compositing** — Overlays the segmented body onto the screen recording at a position and scale you control via drag-and-drop.
- **Local Recording** — Saves the composited output as a video file (via OpenCV or FFmpeg).
- **RTSP Streaming** — Optionally broadcasts the composited feed as an RTSP stream — push it to YouTube, Twitch, or share it on your local network.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Browser (Frontend)                    │
│                                                         │
│  getDisplayMedia ──► Screen Stream ──┐                  │
│                                      ├──► WebSocket ──► │
│  getUserMedia ─────► Webcam Stream ──┘    / WebRTC      │
│                                                         │
│  Drag-and-Drop UI ──► Position (X, Y) + Scale ────────► │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Python Backend                         │
│                                                         │
│  Webcam Frame ──► YOLO26n-seg (ONNX) ──► Person Mask   │
│                                                         │
│  Screen Frame + Masked Person ──► Alpha Compositing     │
│                                                         │
│  Composited Frame ──► VideoWriter (local .mp4)          │
│                   ──► RTSP Stream (optional)            │
└─────────────────────────────────────────────────────────┘
```

### Inference — Hardware Fallback

All inference runs through `onnxruntime` with a strict provider hierarchy:

| Priority | Provider                  | Hardware           |
|----------|---------------------------|--------------------|
| 1        | `CUDAExecutionProvider`   | NVIDIA GPU         |
| 2        | `OpenVINOExecutionProvider` | Intel CPU/iGPU   |
| 3        | `CPUExecutionProvider`    | Any machine        |

No manual config needed — SegStream auto-detects the best available provider at startup.

---

## Tech Stack

| Layer      | Tech                                                  |
|------------|-------------------------------------------------------|
| Frontend   | HTML / JavaScript (vanilla)                           |
| Streaming  | WebSocket / WebRTC (`aiortc`)                         |
| Backend    | Python, OpenCV, NumPy                                 |
| Inference  | ONNX Runtime + YOLO26 Nano Seg                        |
| Recording  | OpenCV `VideoWriter` / FFmpeg subprocess              |
| Broadcast  | RTSP via `mediamtx` / GStreamer                       |

---

## Project Structure

```
SegStream/
├── frontend/               # Browser-based capture & positioning UI
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── server.py           # WebSocket/WebRTC server — receives streams
│   ├── segmentation.py     # YOLO26 ONNX inference + mask extraction
│   ├── compositor.py       # Alpha blending — person onto screen
│   ├── recorder.py         # Local video recording (OpenCV / FFmpeg)
│   ├── streamer.py         # RTSP stream output
│   └── providers.py        # ONNX EP detection + fallback logic
├── models/                 # ONNX model files (not tracked in git)
│   └── yolo26n-seg.onnx
├── requirements.txt
├── .cursorrules            # Project spec & AI assistant instructions
└── README.md
```

---

## Quick Start

### Prerequisites

- Python 3.10+
- A modern browser (Chrome / Edge recommended for `getDisplayMedia`)
- (Optional) NVIDIA GPU with CUDA for accelerated inference

### 1. Clone & Install

```bash
git clone https://github.com/akshaysatyam2/SegStream.git
cd SegStream
pip install -r requirements.txt
```

### 2. Export the YOLO26 Model to ONNX

```bash
# Using ultralytics CLI
yolo export model=yolo26n-seg.pt format=onnx imgsz=640 simplify=True
mv yolo26n-seg.onnx models/
```

### 3. Start the Backend

```bash
python backend/server.py
```

The server will auto-detect the best ONNX execution provider and log it:
```
[SegStream] Using CUDAExecutionProvider
[SegStream] Server running on ws://localhost:8765
```

### 4. Open the Frontend

Open `frontend/index.html` in your browser (or serve it via a simple HTTP server):

```bash
python -m http.server 3000 --directory frontend
```

Navigate to `http://localhost:3000`, select your screen/window, position your webcam overlay, and hit record.

### 5. (Optional) RTSP Stream

To expose the composited output as an RTSP stream:

```bash
# Start mediamtx (or your preferred RTSP server)
./mediamtx

# SegStream will push frames to rtsp://localhost:8554/segstream
```

Use this URL in OBS, VLC, or as a source for YouTube/Twitch.

---

## Target Performance

| Metric              | Target          |
|---------------------|-----------------|
| Compositing FPS     | 30–60 FPS       |
| Inference latency   | < 15ms (GPU)    |
| End-to-end latency  | < 100ms         |
| Model size (ONNX)   | ~12 MB (nano)   |

---

## Roadmap

- [ ] Core backend — stream reception, YOLO inference, compositing
- [ ] Frontend — screen/webcam capture, positioning UI
- [ ] Local recording (MP4 output)
- [ ] RTSP streaming
- [ ] Multi-person segmentation support
- [ ] Audio capture & sync
- [ ] Electron/Tauri wrapper for native desktop app

---

## Contributing

This project is in active development. If you're a CV engineer, ML enthusiast, or just want a better screen recorder — PRs are welcome.

---

## License

MIT
