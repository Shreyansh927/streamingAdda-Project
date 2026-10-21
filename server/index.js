import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.API_PORT || 5000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://127.0.0.1:3005";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 1024);

const UPLOAD_DIR = path.join(__dirname, "uploads");
const WATERMARK_DIR = path.join(UPLOAD_DIR, "watermarks");
const DATA_DIR = path.join(__dirname, "data");
const GENERATED_DIR = path.join(DATA_DIR, "generated");

const DB_FILE = path.join(DATA_DIR, "videos.json");
const CHANNELS_FILE = path.join(DATA_DIR, "channels.json");
const SLOTS_FILE = path.join(DATA_DIR, "slots.json");
const PLAYLISTS_FILE = path.join(DATA_DIR, "playlists.json");
const WATERMARKS_FILE = path.join(DATA_DIR, "watermarks.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(WATERMARK_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(GENERATED_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");
if (!fs.existsSync(CHANNELS_FILE)) fs.writeFileSync(CHANNELS_FILE, "[]", "utf8");
if (!fs.existsSync(PLAYLISTS_FILE)) fs.writeFileSync(PLAYLISTS_FILE, "[]", "utf8");
if (!fs.existsSync(WATERMARKS_FILE)) fs.writeFileSync(WATERMARKS_FILE, "[]", "utf8");

const DEFAULT_SLOTS = [
  { id: "slot-1", name: "Slot 1 (Main Stream)", createdAt: new Date().toISOString() },
  { id: "slot-2", name: "Slot 2 (Secondary)", createdAt: new Date().toISOString() }
];

if (!fs.existsSync(SLOTS_FILE)) {
  fs.writeFileSync(SLOTS_FILE, JSON.stringify(DEFAULT_SLOTS, null, 2), "utf8");
}

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

// JSON Read/Write Helpers
const readVideos = () => {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; }
};
const writeVideos = (videos) => fs.writeFileSync(DB_FILE, JSON.stringify(videos, null, 2));

const readChannels = () => {
  try { return JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf8")); } catch { return []; }
};
const writeChannels = (channels) => fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));

const readSlots = () => {
  try {
    const data = JSON.parse(fs.readFileSync(SLOTS_FILE, "utf8"));
    return Array.isArray(data) && data.length > 0 ? data : DEFAULT_SLOTS;
  } catch { return DEFAULT_SLOTS; }
};
const writeSlots = (slots) => fs.writeFileSync(SLOTS_FILE, JSON.stringify(slots, null, 2));

const readPlaylists = () => {
  try { return JSON.parse(fs.readFileSync(PLAYLISTS_FILE, "utf8")); } catch { return []; }
};
const writePlaylists = (playlists) => fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));

const readWatermarks = () => {
  try { return JSON.parse(fs.readFileSync(WATERMARKS_FILE, "utf8")); } catch { return []; }
};
const writeWatermarks = (wm) => fs.writeFileSync(WATERMARKS_FILE, JSON.stringify(wm, null, 2));

const safeVideo = (video) => ({
  id: video.id,
  filename: video.filename,
  originalName: video.originalName,
  size: video.size,
  uploadedAt: video.uploadedAt,
  url: `/uploads/${encodeURIComponent(video.filename)}`,
});

// Active Streams
const activeStreams = new Map();
const history = [];

const pushHistory = (type, message) => {
  history.unshift({
    id: crypto.randomUUID(),
    type,
    message,
    at: new Date().toISOString(),
  });
  if (history.length > 50) history.pop();
};

const getStreamInfo = (s) => {
  if (!s) return null;
  return {
    id: s.id,
    slotId: s.slotId,
    mode: s.mode || "video", // 'video' | 'playlist'
    videoId: s.videoId,
    playlistId: s.playlistId,
    title: s.title || s.filename,
    status: s.status,
    loop: s.loop,
    quality: s.quality || "720p",
    watermark: s.watermark || null,
    startedAt: s.startedAt,
    destinations: s.destinations || [],
    message: s.message,
    logs: s.logs.slice(-15),
  };
};

const getStatus = () => {
  const slots = readSlots();
  const slotStatuses = slots.map((slot) => ({
    id: slot.id,
    name: slot.name,
    active: getStreamInfo(activeStreams.get(slot.id)),
  }));

  let firstActive = null;
  for (const [, stream] of activeStreams.entries()) {
    firstActive = getStreamInfo(stream);
    break;
  }

  return {
    slots: slotStatuses,
    active: firstActive,
    activeCount: activeStreams.size,
    history: history.slice(0, 15),
    videoCount: readVideos().length,
    channelCount: readChannels().length,
    playlistCount: readPlaylists().length,
    watermarkCount: readWatermarks().length,
  };
};

// Storage setup for video uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
  },
});

// Storage setup for watermark logos
const watermarkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, WATERMARK_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `wm-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  },
});

const allowedVideoExts = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedVideoExts.has(ext)) return cb(new Error("Unsupported video format."));
    cb(null, true);
  },
});

const uploadWatermark = multer({
  storage: watermarkStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for PNG logo
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      return cb(new Error("Watermark must be a PNG, JPG, or WEBP image."));
    }
    cb(null, true);
  },
});

// ==================== SYSTEM ROUTES ====================
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "streamadda-api", activeSlots: activeStreams.size });
});

app.get("/api/status", (_req, res) => {
  res.json(getStatus());
});

// ==================== VIDEOS ====================
app.get("/api/videos", (_req, res) => {
  const videos = readVideos()
    .map(safeVideo)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json(videos);
});

app.post("/api/videos", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Select a video file." });

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
  pushHistory("upload", `Uploaded video: ${video.originalName}`);
  res.status(201).json(safeVideo(video));
});

// Direct URL Importer
app.post("/api/videos/import-url", async (req, res) => {
  const { url, filename } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A valid video URL is required." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "URL must use http:// or https://" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL provided." });
  }

  const cleanName = (filename || path.basename(parsedUrl.pathname) || "downloaded-video.mp4").trim();
  const ext = path.extname(cleanName) || ".mp4";
  const targetFilename = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, targetFilename);

  try {
    pushHistory("import", `Starting download from: ${cleanName}`);
    const response = await fetch(parsedUrl.href, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) StreamAddaDownloader/1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
    }

    const fileStream = fs.createWriteStream(targetPath, { flags: "w" });
    await finished(Readable.fromWeb(response.body).pipe(fileStream));

    const stats = fs.statSync(targetPath);
    if (stats.size < 1000) {
      fs.unlinkSync(targetPath);
      throw new Error("Downloaded file is too small or invalid.");
    }

    const video = {
      id: crypto.randomUUID(),
      filename: targetFilename,
      originalName: cleanName,
      size: stats.size,
      uploadedAt: new Date().toISOString(),
    };

    const videos = readVideos();
    videos.push(video);
    writeVideos(videos);
    pushHistory("import", `Successfully downloaded: ${cleanName} (${(stats.size / (1024 * 1024)).toFixed(1)} MB)`);

    res.status(201).json(safeVideo(video));
  } catch (err) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    pushHistory("error", `Import failed for ${cleanName}: ${err.message}`);
    res.status(400).json({ error: `Download failed: ${err.message}` });
  }
});

app.delete("/api/videos/:id", (req, res) => {
  const videos = readVideos();
  const video = videos.find((v) => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found." });

  for (const [, stream] of activeStreams.entries()) {
    if (stream.videoId === video.id) {
      return res.status(409).json({ error: "Stop active streams using this video before deleting." });
    }
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(video.filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  writeVideos(videos.filter((v) => v.id !== video.id));
  pushHistory("delete", `Deleted ${video.originalName}`);
  res.json({ ok: true });
});

// ==================== PLAYLISTS ====================
app.get("/api/playlists", (_req, res) => {
  const playlists = readPlaylists();
  const videos = readVideos();

  // Hydrate playlists with video metadata
  const hydrated = playlists.map((pl) => ({
    id: pl.id,
    name: pl.name,
    videoIds: pl.videoIds || [],
    videos: (pl.videoIds || [])
      .map((id) => videos.find((v) => v.id === id))
      .filter(Boolean)
      .map(safeVideo),
    createdAt: pl.createdAt,
    updatedAt: pl.updatedAt,
  }));

  res.json(hydrated);
});

app.post("/api/playlists", (req, res) => {
  const { name, videoIds = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Playlist name is required." });

  const playlists = readPlaylists();
  const newPl = {
    id: `pl-${crypto.randomUUID()}`,
    name: name.trim(),
    videoIds: Array.isArray(videoIds) ? videoIds : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  playlists.push(newPl);
  writePlaylists(playlists);
  pushHistory("playlist", `Created playlist: ${newPl.name}`);
  res.status(201).json(newPl);
});

app.put("/api/playlists/:id", (req, res) => {
  const playlists = readPlaylists();
  const index = playlists.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Playlist not found." });

  const { name, videoIds } = req.body;
  playlists[index] = {
    ...playlists[index],
    ...(name !== undefined && { name: name.trim() }),
    ...(Array.isArray(videoIds) && { videoIds }),
    updatedAt: new Date().toISOString(),
  };

  writePlaylists(playlists);
  res.json(playlists[index]);
});

app.delete("/api/playlists/:id", (req, res) => {
  const playlists = readPlaylists();
  const target = playlists.find((p) => p.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Playlist not found." });

  for (const [, stream] of activeStreams.entries()) {
    if (stream.playlistId === target.id) {
      return res.status(409).json({ error: "Stop the stream using this playlist before deleting." });
    }
  }

  writePlaylists(playlists.filter((p) => p.id !== req.params.id));
  pushHistory("playlist", `Deleted playlist: ${target.name}`);
  res.json({ ok: true });
});

// ==================== WATERMARKS (CHANNEL LOGOS) ====================
app.get("/api/watermarks", (_req, res) => {
  res.json(readWatermarks());
});

app.post("/api/watermarks", uploadWatermark.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Select a PNG/JPG logo file." });

  const { name } = req.body;
  const list = readWatermarks();
  const item = {
    id: crypto.randomUUID(),
    name: (name || req.file.originalname).trim(),
    filename: req.file.filename,
    url: `/uploads/watermarks/${encodeURIComponent(req.file.filename)}`,
    uploadedAt: new Date().toISOString(),
  };

  list.push(item);
  writeWatermarks(list);
  pushHistory("watermark", `Added channel logo: ${item.name}`);
  res.status(201).json(item);
});

app.delete("/api/watermarks/:id", (req, res) => {
  const list = readWatermarks();
  const target = list.find((w) => w.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Watermark not found." });

  const filePath = path.join(WATERMARK_DIR, path.basename(target.filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  writeWatermarks(list.filter((w) => w.id !== req.params.id));
  pushHistory("watermark", `Deleted logo: ${target.name}`);
  res.json({ ok: true });
});

// ==================== CHANNELS ====================
app.get("/api/channels", (_req, res) => {
  res.json(readChannels());
});

app.post("/api/channels", (req, res) => {
  const { name, platform, serverUrl, streamKey } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Channel name is required." });
  if (!serverUrl?.trim() && !streamKey?.trim()) {
    return res.status(400).json({ error: "RTMP URL or stream key is required." });
  }

  const channels = readChannels();
  const newChannel = {
    id: crypto.randomUUID(),
    name: name.trim(),
    platform: platform || "custom",
    serverUrl: (serverUrl || "").trim(),
    streamKey: (streamKey || "").trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  channels.push(newChannel);
  writeChannels(channels);
  pushHistory("channel", `Added channel: ${newChannel.name}`);
  res.status(201).json(newChannel);
});

app.delete("/api/channels/:id", (req, res) => {
  const channels = readChannels();
  const target = channels.find((c) => c.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Channel not found." });

  writeChannels(channels.filter((c) => c.id !== req.params.id));
  pushHistory("channel", `Deleted channel: ${target.name}`);
  res.json({ ok: true });
});

// ==================== SLOTS ====================
app.get("/api/slots", (_req, res) => {
  const slots = readSlots().map((slot) => ({
    id: slot.id,
    name: slot.name,
    active: getStreamInfo(activeStreams.get(slot.id)),
  }));
  res.json(slots);
});

app.post("/api/slots", (req, res) => {
  const { name } = req.body;
  const slots = readSlots();
  const newSlot = {
    id: `slot-${crypto.randomBytes(3).toString("hex")}`,
    name: (name || `Slot ${slots.length + 1}`).trim(),
    createdAt: new Date().toISOString(),
  };

  slots.push(newSlot);
  writeSlots(slots);
  pushHistory("slot", `Created new slot: ${newSlot.name}`);
  res.status(201).json(newSlot);
});

app.delete("/api/slots/:id", (req, res) => {
  const slots = readSlots();
  if (slots.length <= 1) return res.status(400).json({ error: "You must keep at least one slot." });
  if (activeStreams.has(req.params.id)) {
    return res.status(409).json({ error: "Stop the stream in this slot before deleting it." });
  }
  writeSlots(slots.filter((s) => s.id !== req.params.id));
  res.json({ ok: true });
});

// ==================== STREAM PROCESS RUNNER ====================
const startSlotStream = (slotId, payload) => {
  if (activeStreams.has(slotId)) {
    throw new Error(`Slot "${slotId}" already has an active stream.`);
  }

  const {
    mode = "video", // 'video' or 'playlist'
    videoId,
    playlistId,
    destination,
    destinations = [],
    channelIds = [],
    loop = true,
    quality = "720p",
    watermarkId,
    watermarkPosition = "top-right",
  } = payload;

  let streamTitle = "";
  let ffmpegInputArgs = [];
  let tempConcatFile = null;

  if (mode === "playlist") {
    const playlist = readPlaylists().find((p) => p.id === playlistId);
    if (!playlist) throw new Error("Selected playlist not found.");
    if (!playlist.videoIds || playlist.videoIds.length === 0) {
      throw new Error("Selected playlist has no videos.");
    }

    const allVideos = readVideos();
    const resolvedVideos = playlist.videoIds
      .map((id) => allVideos.find((v) => v.id === id))
      .filter(Boolean);

    if (resolvedVideos.length === 0) {
      throw new Error("None of the videos in this playlist exist on disk.");
    }

    // Generate concat text file
    tempConcatFile = path.join(GENERATED_DIR, `concat_${slotId}_${Date.now()}.txt`);
    const fileLines = resolvedVideos.map((v) => {
      const fullPath = path.join(UPLOAD_DIR, path.basename(v.filename)).replace(/\\/g, "/");
      return `file '${fullPath}'`;
    });

    fs.writeFileSync(tempConcatFile, fileLines.join("\n"), "utf8");
    streamTitle = `Playlist: ${playlist.name} (${resolvedVideos.length} videos)`;
    ffmpegInputArgs = [
      "-re",
      "-f", "concat",
      "-safe", "0",
      ...(loop ? ["-stream_loop", "-1"] : []),
      "-i", tempConcatFile,
    ];
  } else {
    // Single Video Mode
    const video = readVideos().find((v) => v.id === videoId);
    if (!video) throw new Error("Selected video file not found.");

    const inputPath = path.join(UPLOAD_DIR, path.basename(video.filename));
    if (!fs.existsSync(inputPath)) throw new Error("Video file is missing from disk.");

    streamTitle = video.originalName;
    ffmpegInputArgs = [
      "-re",
      ...(loop ? ["-stream_loop", "-1"] : []),
      "-i", inputPath,
    ];
  }

  // Watermark setup
  let watermarkItem = null;
  let watermarkPath = null;
  if (watermarkId) {
    watermarkItem = readWatermarks().find((w) => w.id === watermarkId);
    if (watermarkItem) {
      const p = path.join(WATERMARK_DIR, path.basename(watermarkItem.filename));
      if (fs.existsSync(p)) {
        watermarkPath = p;
      }
    }
  }

  // Resolve Destinations
  const resolvedTargets = [];
  const channels = readChannels();

  if (Array.isArray(channelIds)) {
    for (const chId of channelIds) {
      const ch = channels.find((c) => c.id === chId);
      if (ch) {
        let fullUrl = ch.serverUrl.trim();
        const key = ch.streamKey.trim();
        if (key) {
          fullUrl = fullUrl.endsWith("/") ? `${fullUrl}${key}` : `${fullUrl}/${key}`;
        }
        resolvedTargets.push({ name: ch.name, url: fullUrl });
      }
    }
  }

  if (Array.isArray(destinations)) {
    for (const d of destinations) {
      const url = typeof d === "string" ? d.trim() : d.url?.trim();
      if (url && !resolvedTargets.some((t) => t.url === url)) {
        resolvedTargets.push({ name: typeof d === "object" ? d.name || "Custom RTMP" : "Custom RTMP", url });
      }
    }
  }

  if (destination && typeof destination === "string" && destination.trim()) {
    const url = destination.trim();
    if (!resolvedTargets.some((t) => t.url === url)) {
      resolvedTargets.push({ name: "Custom RTMP", url });
    }
  }

  if (resolvedTargets.length === 0) {
    throw new Error("Select at least one destination channel or enter an RTMP URL.");
  }

  // Validate URLs
  for (const t of resolvedTargets) {
    let parsed;
    try {
      parsed = new URL(t.url);
    } catch {
      throw new Error(`Invalid destination URL for "${t.name}".`);
    }
    if (!["rtmp:", "rtmps:"].includes(parsed.protocol)) {
      throw new Error(`Destination for "${t.name}" must use rtmp:// or rtmps://.`);
    }
  }

  // Video Quality & Filter Complex
  let targetWidth = 1280;
  let targetHeight = 720;
  let videoBitrate = "2500k";

  if (quality === "1080p") {
    targetWidth = 1920;
    targetHeight = 1080;
    videoBitrate = "4500k";
  } else if (quality === "480p") {
    targetWidth = 854;
    targetHeight = 480;
    videoBitrate = "1200k";
  }

  const baseScaleFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;

  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    ...ffmpegInputArgs,
  ];

  if (watermarkPath) {
    args.push("-i", watermarkPath);

    let overlayPos = "W-w-20:20"; // top-right
    if (watermarkPosition === "top-left") overlayPos = "20:20";
    else if (watermarkPosition === "bottom-right") overlayPos = "W-w-20:H-h-20";
    else if (watermarkPosition === "bottom-left") overlayPos = "20:H-h-20";

    const filterComplex = `[0:v]${baseScaleFilter}[base];[1:v]scale=160:-1[logo];[base][logo]overlay=${overlayPos}[v]`;
    args.push("-filter_complex", filterComplex, "-map", "[v]", "-map", "0:a");
  } else {
    args.push("-vf", baseScaleFilter);
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-b:v", videoBitrate,
    "-maxrate", videoBitrate,
    "-bufsize", `${parseInt(videoBitrate) * 2}k`,
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-g", "60",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100"
  );

  if (resolvedTargets.length === 1) {
    args.push("-f", "flv", resolvedTargets[0].url);
  } else {
    const teeString = resolvedTargets.map((t) => `[f=flv:onfail=ignore]${t.url}`).join("|");
    args.push("-f", "tee", "-map", "0:v", "-map", "0:a", teeString);
  }

  const stream = {
    id: crypto.randomUUID(),
    slotId,
    mode,
    videoId: mode === "video" ? videoId : null,
    playlistId: mode === "playlist" ? playlistId : null,
    title: streamTitle,
    filename: streamTitle,
    destinations: resolvedTargets.map((t) => t.name),
    status: "starting",
    loop: Boolean(loop),
    quality,
    watermark: watermarkItem ? watermarkItem.name : null,
    startedAt: new Date().toISOString(),
    message: `Broadcasting ${streamTitle} to ${resolvedTargets.length} destination${resolvedTargets.length > 1 ? "s" : ""}...`,
    logs: [],
    child: null,
    tempFile: tempConcatFile,
  };

  activeStreams.set(slotId, stream);
  pushHistory("start", `Slot [${slotId}]: Streaming "${streamTitle}" to ${stream.destinations.join(", ")}`);

  const child = spawn(FFMPEG_PATH, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  stream.child = child;

  child.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (!line) return;

    let safeLine = line;
    for (const t of resolvedTargets) {
      safeLine = safeLine.split(t.url).join(`[${t.name} destination redacted]`);
    }

    stream.logs.push(safeLine);
    if (stream.logs.length > 60) stream.logs.shift();

    if (/Output #0|Press \[q\] to stop|frame=/i.test(line)) {
      stream.status = "streaming";
      stream.message = `Broadcasting to ${resolvedTargets.length} destination${resolvedTargets.length > 1 ? "s" : ""}.`;
    }
  });

  child.on("error", (err) => {
    stream.status = "error";
    stream.message = err.code === "ENOENT" ? "FFmpeg not found in PATH." : err.message;
    pushHistory("error", `Slot [${slotId}]: ${stream.message}`);
    if (stream.tempFile && fs.existsSync(stream.tempFile)) fs.unlinkSync(stream.tempFile);
    activeStreams.delete(slotId);
  });

  child.on("close", (code) => {
    if (stream.status !== "error") {
      stream.status = code === 0 ? "stopped" : "error";
      stream.message = code === 0 ? "FFmpeg stopped normally." : `FFmpeg exited with code ${code}.`;
    }
    pushHistory(stream.status, `Slot [${slotId}]: ${stream.title} - ${stream.message}`);
    if (stream.tempFile && fs.existsSync(stream.tempFile)) fs.unlinkSync(stream.tempFile);
    activeStreams.delete(slotId);
  });

  setTimeout(() => {
    if (activeStreams.get(slotId)?.id === stream.id && stream.status === "starting") {
      stream.status = "streaming";
      stream.message = `Streaming active: broadcasting to ${resolvedTargets.length} destination(s).`;
    }
  }, 1000);

  return stream;
};

const stopSlotStream = (slotId) => {
  const stream = activeStreams.get(slotId);
  if (!stream || !stream.child) {
    throw new Error(`No active stream running in slot "${slotId}".`);
  }

  stream.status = "stopping";
  stream.message = "Stopping FFmpeg...";

  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(stream.child.pid), "/f", "/t"]);
    } catch {
      stream.child.kill("SIGTERM");
    }
  } else {
    stream.child.kill("SIGTERM");
  }

  if (stream.tempFile && fs.existsSync(stream.tempFile)) {
    try { fs.unlinkSync(stream.tempFile); } catch {}
  }

  pushHistory("stop", `Slot [${slotId}]: Stop signal sent for ${stream.title}`);
  activeStreams.delete(slotId);
};

// Stream Routes
app.post("/api/slots/:slotId/start", (req, res) => {
  try {
    const stream = startSlotStream(req.params.slotId, req.body);
    res.status(202).json({
      ok: true,
      message: `Stream started in ${req.params.slotId}`,
      stream: getStreamInfo(stream),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/slots/:slotId/stop", (req, res) => {
  try {
    stopSlotStream(req.params.slotId);
    res.json({ ok: true, message: `Stopped stream in ${req.params.slotId}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/streams/start", (req, res) => {
  const slotId = req.body.slotId || readSlots()[0]?.id || "slot-1";
  try {
    const stream = startSlotStream(slotId, req.body);
    res.status(202).json({ ok: true, message: "Stream started.", stream: getStreamInfo(stream) });
  } catch (err) {
    const status = err.message.includes("already has an active stream") ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

app.post("/api/streams/stop", (req, res) => {
  const slots = readSlots();
  const slotId = req.body.slotId || (activeStreams.keys().next().value || slots[0]?.id || "slot-1");
  try {
    stopSlotStream(slotId);
    res.json({ ok: true, message: "Stop signal sent." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Serve compiled React frontend in production if dist/ exists
const DIST_DIR = path.join(__dirname, "../dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// Multer error handling
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      error: err.code === "LIMIT_FILE_SIZE" ? `File exceeds size limit.` : err.message,
    });
  }
  res.status(400).json({ error: err.message || "Request failed." });
});

const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`StreamAdda Studio running at http://${HOST}:${PORT}`);
  console.log(`FFmpeg: ${FFMPEG_PATH}`);
});
