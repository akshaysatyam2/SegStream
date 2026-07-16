# SegStream

A lightweight, open-source alternative to OBS Studio — real-time AI background removal, no green screen needed.

SegStream captures your screen and webcam simultaneously, runs YOLO segmentation on the webcam feed to extract your body, and composites it directly onto the screen recording. Clean segmentation, minimal latency, works with or without a GPU.

---

## Demo & Walkthrough

Curious to see how it looks and why it was built? Check out the included demonstration video:
[🎬 Watch the Demo & Walkthrough (`recordings/Demo_and_Walkthrough.webm`)](recordings/Demo_and_Walkthrough.webm)

---

## Why SegStream?

OBS is great, but it's bloated for a simple use case: **record your screen with a webcam overlay that has no background**. Most virtual background tools either need a green screen or run through clunky browser extensions. SegStream handles it natively — one tool, no dependencies on third-party plugins.

---

## Features

- **Screen + Webcam Capture** — Uses browser APIs (`getDisplayMedia` + `getUserMedia`) to grab both streams natively.
- **AI Background Removal** — YOLO26 Nano Segmentation strips your background in real-time. No green screen, no manual masking.
- **Drag-and-Drop Positioning** — Place and resize your webcam overlay anywhere on the screen recording before you hit record.
- **Local Recording** — Saves composited output as MP4 (OpenCV VideoWriter / FFmpeg).
- **RTSP Streaming** — Optionally broadcast the composited feed over RTSP — push to YouTube, Twitch, or use as a virtual camera source.
- **Hardware Acceleration** — ONNX Runtime with automatic fallback: CUDA → OpenVINO → CPU. Zero config needed.

---

## Architecture

```
Browser (Frontend)
├── getDisplayMedia ──► Screen Stream ──┐
│                                       ├──► WebSocket / WebRTC
├── getUserMedia ─────► Webcam Stream ──┘
└── Overlay UI ───────► Position + Scale coords
                          │
                          ▼
Python Backend
├── Receive synced streams
├── YOLO26n-seg (ONNX Runtime) ──► Person Mask
├── Alpha Compositing (OpenCV/NumPy)
├── ──► Local MP4 Recording
└── ──► RTSP Stream (optional)
```

### ONNX Execution Provider Fallback

| Priority | Provider                    | Hardware         |
|----------|-----------------------------|------------------|
| 1        | `CUDAExecutionProvider`     | NVIDIA GPU       |
| 2        | `OpenVINOExecutionProvider` | Intel CPU / iGPU |
| 3        | `CPUExecutionProvider`      | Any machine      |

Auto-detected at startup. No manual configuration.

---

## Project Structure

```
SegStream/
├── frontend/
│   ├── index.html          # Capture UI + overlay positioning
│   ├── style.css
│   └── app.js              # Stream capture + backend connection
├── backend/
│   ├── server.py           # WebSocket/WebRTC server
│   ├── segmentation.py     # YOLO26 ONNX inference + mask extraction
│   ├── compositor.py       # Alpha blending — person onto screen
│   ├── recorder.py         # Local video recording
│   ├── streamer.py         # RTSP stream output
│   └── providers.py        # ONNX EP detection + fallback logic
├── models/
│   └── yolo26n-seg.onnx    # Not tracked — download separately
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- Modern browser (Chrome or Edge recommended)
- (Optional) NVIDIA GPU with CUDA for faster inference

### Install

```bash
git clone https://github.com/akshaysatyam2/SegStream.git
cd SegStream
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# (Optional) For Intel CPU/iGPU OpenVINO acceleration:
# pip uninstall onnxruntime && pip install onnxruntime-openvino

# (Optional) For NVIDIA GPU CUDA acceleration:
# pip uninstall onnxruntime && pip install onnxruntime-gpu
```

### Export YOLO26 Model to ONNX

```bash
pip install ultralytics
yolo export model=yolo26n-seg.pt format=onnx imgsz=640 simplify=True
mkdir -p models && mv yolo26n-seg.onnx models/
```

### Run

**Start the backend:**

```bash
python backend/server.py
```

```
[SegStream] Detected: CUDAExecutionProvider
[SegStream] Server running on ws://localhost:8765
```

**Serve the frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — select your screen/window, position the webcam overlay, hit record.

### RTSP Streaming (Optional)

Start an RTSP server like [mediamtx](https://github.com/bluenviron/mediamtx):

```bash
./mediamtx
```

SegStream pushes frames to `rtsp://localhost:8554/segstream`. Use this URL in OBS, VLC, or as a stream source for YouTube/Twitch.

---

## Performance Targets

| Metric            | Target        |
|--------------------|--------------|
| Compositing FPS    | 30–60 FPS    |
| Inference latency  | < 15ms (GPU) |
| End-to-end latency | < 100ms      |
| Model size (ONNX)  | ~12 MB       |

---

## Roadmap

- [x] Core backend — stream reception, YOLO inference, compositing pipeline
- [x] Frontend — screen/webcam capture, drag-and-drop overlay UI
- [x] Local recording (MP4 output via OpenCV/FFmpeg)
- [x] RTSP streaming support
- [x] Audio capture and sync
- [ ] Multi-person segmentation
- [x] Floating record button & Provider UI
- [ ] Desktop app wrapper (Electron / Tauri)

---

## Contributing

Project is in active development. PRs, issues, and feedback are welcome — especially from folks working in CV or real-time video pipelines.

---

## License

MIT
