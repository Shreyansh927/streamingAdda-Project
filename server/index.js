import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.API_PORT || 5000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://127.0.0.1:3005";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 1024);

const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "videos.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const readVideos = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return [];
  }
};

const writeVideos = (videos) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(videos, null, 2));
};

const safeVideo = (video) => ({
  id: video.id,
  filename: video.filename,
  originalName: video.originalName,
  size: video.size,
  uploadedAt: video.uploadedAt,
  url: `/uploads/${encodeURIComponent(video.filename)}`,
});

let activeStream = null;
const history = [];

const pushHistory = (type, message) => {
  history.unshift({
    id: crypto.randomUUID(),
    type,
    message,
    at: new Date().toISOString(),
  });

  if (history.length > 30) history.pop();
};

const getStatus = () => ({
  active: activeStream
    ? {
        id: activeStream.id,
        videoId: activeStream.videoId,
        filename: activeStream.filename,
        status: activeStream.status,
        loop: activeStream.loop,
        startedAt: activeStream.startedAt,
        message: activeStream.message,
        logs: activeStream.logs.slice(-12),
      }
    : null,
  history: history.slice(0, 12),
  videoCount: readVideos().length,
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
  },
});

const allowedExtensions = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },

  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(ext)) {
      return cb(new Error("Unsupported video format."));
    }

    cb(null, true);
  },
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "streamadda-api" });
});

// Stream status
app.get("/api/status", (_req, res) => {
  res.json(getStatus());
});

// List videos
app.get("/api/videos", (_req, res) => {
  const videos = readVideos()
    .map(safeVideo)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  res.json(videos);
});

// Upload video
app.post("/api/videos", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Select a video file." });
  }

  const videos = readVideos();

  const video = {
    id: crypto.randomUUID(),
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
  };

  videos.push(video);
  writeVideos(videos);

  pushHistory("upload", `Uploaded ${video.originalName}`);

  res.status(201).json(safeVideo(video));
});

// Delete video
app.delete("/api/videos/:id", (req, res) => {
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);

  if (!video) {
    return res.status(404).json({ error: "Video not found." });
  }

  if (activeStream?.videoId === video.id) {
    return res.status(409).json({
      error: "Stop the active stream before deleting this video.",
    });
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(video.filename));

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  writeVideos(videos.filter((v) => v.id !== video.id));
  pushHistory("delete", `Deleted ${video.originalName}`);

  res.json({ ok: true });
});

// Start stream
app.post("/api/streams/start", (req, res) => {
  if (activeStream) {
    return res.status(409).json({
      error: "A stream is already running.",
    });
  }

  const { videoId, destination, loop = true } = req.body;
  const video = readVideos().find((v) => v.id === videoId);

  if (!video) {
    return res.status(404).json({ error: "Choose a video." });
  }

  let target;

  try {
    target = new URL(String(destination || "").trim());
  } catch {
    return res.status(400).json({ error: "Invalid RTMP destination URL." });
  }

  if (!["rtmp:", "rtmps:"].includes(target.protocol)) {
    return res.status(400).json({
      error: "Destination must use rtmp:// or rtmps://.",
    });
  }

  const inputPath = path.join(UPLOAD_DIR, path.basename(video.filename));

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: "Video file is missing." });
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
    ...(loop ? ["-stream_loop", "-1"] : []),
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-f",
    "flv",
    target.href,
  ];

  const stream = {
    id: crypto.randomUUID(),
    videoId: video.id,
    filename: video.originalName,
    status: "starting",
    loop: Boolean(loop),
    startedAt: new Date().toISOString(),
    message: "Starting FFmpeg...",
    logs: [],
    child: null,
  };

  activeStream = stream;
  pushHistory("start", `Starting stream: ${video.originalName}`);

  const child = spawn(FFMPEG_PATH, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  stream.child = child;

  child.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();

    if (!line) return;

    // Avoid returning the RTMP destination or stream key in logs.
    const safeLine = line.split(target.href).join("[destination redacted]");

    stream.logs.push(safeLine);

    if (stream.logs.length > 60) {
      stream.logs.shift();
    }

    if (/Output #0|Press \[q\] to stop/i.test(line)) {
      stream.status = "streaming";
      stream.message =
        "FFmpeg is sending media. Verify reception on your platform.";
    }
  });

  child.on("error", (err) => {
    stream.status = "error";
    stream.message =
      err.code === "ENOENT"
        ? "FFmpeg not found. Install it or configure FFMPEG_PATH."
        : err.message;

    pushHistory("error", stream.message);

    if (activeStream?.id === stream.id) {
      activeStream = null;
    }
  });

  child.on("close", (code) => {
    if (stream.status !== "error") {
      stream.status = code === 0 ? "stopped" : "error";
      stream.message =
        code === 0 ? "FFmpeg stopped." : `FFmpeg exited with code ${code}.`;
    }

    pushHistory(stream.status, `${stream.filename}: ${stream.message}`);

    if (activeStream?.id === stream.id) {
      activeStream = null;
    }
  });

  setTimeout(() => {
    if (activeStream?.id === stream.id && stream.status === "starting") {
      stream.status = "streaming";
      stream.message = "FFmpeg started. Verify the destination preview.";
    }
  }, 900);

  res.status(202).json({
    ok: true,
    message: "Stream start requested.",
  });
});

// Stop stream
app.post("/api/streams/stop", (_req, res) => {
  if (!activeStream?.child) {
    return res.status(400).json({ error: "No active stream." });
  }

  const stream = activeStream;
  stream.status = "stopping";
  stream.message = "Stopping FFmpeg...";

  stream.child.kill("SIGTERM");
  pushHistory("stop", `Stopping stream: ${stream.filename}`);

  res.json({ ok: true, message: "Stop signal sent." });
});

// Error handler
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;

    return res.status(status).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? `File exceeds ${MAX_UPLOAD_MB} MB.`
          : err.message,
    });
  }

  res.status(400).json({
    error: err.message || "Request failed.",
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`StreamAdda API running at http://127.0.0.1:${PORT}`);
  console.log(`React app: ${CLIENT_ORIGIN}`);
  console.log(`FFmpeg: ${FFMPEG_PATH}`);
});
