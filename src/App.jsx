import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API = "/api";
function formatBytes(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function timeLabel(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function dateLabel(value) {
  if (!value) return "Recently";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function App() {
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState({
    active: null,
    history: [],
    videoCount: 0,
  });
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [destination, setDestination] = useState("");
  const [loop, setLoop] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const active = status.active;
  const selectedId = videos.some((video) => video.id === selectedVideoId)
    ? selectedVideoId
    : videos[0]?.id || "";

  const notify = (text, type = "info") => setNotice({ text, type });
  const request = async (url, options = {}) => {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await request(`${API}/status`));
    } catch (e) {
      notify(`Cannot reach API: ${e.message}. Is the server running?`, "error");
    }
  }, []);

  useEffect(() => {
    request(`${API}/videos`).then(
      (data) => setVideos(data),
      (e) => notify(e.message, "error"),
    );
    request(`${API}/status`).then(
      setStatus,
      (e) => notify(`Cannot reach API: ${e.message}. Is the server running?`, "error"),
    );
    const timer = setInterval(loadStatus, 2000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const uploadVideo = (file) => {
    if (!file) return;
    const allowed = /\.(mp4|mov|mkv|webm|m4v)$/i.test(file.name);
    if (!allowed)
      return notify("Choose an MP4, MOV, MKV, WebM or M4V file.", "error");
    setUploading(true);
    setUploadProgress(0);
    setNotice(null);
    const form = new FormData();
    form.append("video", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/videos`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = async () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        setUploading(false);
        notify("The server returned an invalid upload response.", "error");
        return;
      }
      setUploading(false);
      if (xhr.status < 200 || xhr.status >= 300)
        return notify(data.error || "Upload failed.", "error");
      setVideos((current) => [data, ...current]);
      setSelectedVideoId(data.id);
      if (fileRef.current) fileRef.current.value = "";
      notify(`${data.originalName} uploaded successfully.`, "success");
      await loadStatus();
    };
    xhr.onerror = () => {
      setUploading(false);
      notify("Upload network error.", "error");
    };
    xhr.send(form);
  };

  const deleteVideo = async (video) => {
    if (!window.confirm(`Delete "${video.originalName}"?`)) return;
    try {
      await request(`${API}/videos/${video.id}`, { method: "DELETE" });
      setVideos((current) => current.filter((v) => v.id !== video.id));
      notify("Video deleted.", "success");
      await loadStatus();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const startStream = async (event) => {
    event.preventDefault();
    if (!selectedId) return notify("Upload and select a video first.", "error");
    if (!destination.trim())
      return notify("Enter your RTMP destination URL.", "error");
    setBusy(true);
    try {
      const data = await request(`${API}/streams/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: selectedId,
          destination: destination.trim(),
          loop,
        }),
      });
      setDestination("");
      notify(data.message || "Stream start requested.", "success");
      await loadStatus();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const stopStream = async () => {
    setBusy(true);
    try {
      const data = await request(`${API}/streams/stop`, { method: "POST" });
      notify(data.message || "Stop signal sent.", "success");
      await loadStatus();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const activeVideo = useMemo(
    () => videos.find((v) => v.id === active?.videoId),
    [videos, active],
  );
  const isLive = Boolean(active);
  const drop = (event) => {
    event.preventDefault();
    if (event.dataTransfer.files?.[0]) uploadVideo(event.dataTransfer.files[0]);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-icon">▶</span>
          <span>
            stream<span className="brand-accent">adda</span>
            <small>STREAMING STUDIO</small>
          </span>
        </a>
        <div className="workspace">
          <div className="avatar">S</div>
          <div>
            <b>My workspace</b>
            <small>Local demo environment</small>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <a className="nav active" href="#overview">
          <span>▦</span> Overview
        </a>
        <a className="nav" href="#library">
          <span>▣</span> Video library
        </a>
        <a className="nav" href="#stream-setup">
          <span>◉</span> Live streams <span className="nav-pill">MVP</span>
        </a>
        <div className="sidebar-bottom">
          <div className="help-icon">?</div>
          <div>
            <b>Streaming guide</b>
            <small>See README.md for setup</small>
          </div>
        </div>
      </aside>

      <main className="main" id="overview">
        <header className="topbar">
          <div className="crumb">
            Workspace <span>/</span> Overview
          </div>
          <div className="top-right">
            <span className="status-dot"></span> API polling{" "}
            <div className="avatar small">S</div>
          </div>
        </header>
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR STREAMING WORKSPACE</p>
            <h1>
              Good evening <span aria-hidden="true">👋</span>
            </h1>
            <p className="muted">
              Upload videos, configure your destination and manage your
              broadcast.
            </p>
          </div>
          <div className="date-chip">
            <span className="green-dot" /> Local workspace
          </div>
        </section>

        {notice && (
          <div className={`notice ${notice.type}`} role="status">
            <span>
              {notice.type === "error"
                ? "!"
                : notice.type === "success"
                  ? "✓"
                  : "i"}
            </span>
            <p>{notice.text}</p>
            <button onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <section className="stats">
          <div className="stat-card">
            <div className="stat-head">
              Uploaded videos <span className="stat-icon purple">▣</span>
            </div>
            <div className="stat-num">{videos.length}</div>
            <div className="stat-foot">Saved on this computer</div>
          </div>
          <div className="stat-card">
            <div className="stat-head">
              Active streams <span className="stat-icon green">◉</span>
            </div>
            <div className="stat-num">{isLive ? 1 : 0}</div>
            <div className="stat-foot">
              <span className="green-text">●</span> FFmpeg process state
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-head">
              Playback mode <span className="stat-icon blue">↻</span>
            </div>
            <div className="stat-num mode-num">
              {isLive ? (active.loop ? "Looping" : "One-time") : "Ready"}
            </div>
            <div className="stat-foot">Continuous playback available</div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel" id="library">
            <div className="panel-heading">
              <div>
                <h2>Video library</h2>
                <p className="muted">Upload and manage source videos.</p>
              </div>
              <span className="count">
                {videos.length} video{videos.length === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className={`upload-zone ${uploading ? "uploading" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={drop}
            >
              <div className="upload-symbol">↑</div>
              <h3>Drop your video here</h3>
              <p>or choose a video from your computer</p>
              <button
                className="file-button"
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Choose video"}
              </button>
              <input
                ref={fileRef}
                className="hidden-input"
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.m4v"
                onChange={(e) => uploadVideo(e.target.files?.[0])}
              />
              <small>MP4, MOV, MKV, WebM or M4V · max 1 GB by default</small>
              {uploading && (
                <div className="progress">
                  <div style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
              {uploading && <small>{uploadProgress}% uploaded</small>}
            </div>
            <div className="library-list">
              {videos.length === 0 ? (
                <div className="empty">
                  <span>▤</span>
                  <b>Your library is empty</b>
                  <small>Upload a video to get started.</small>
                </div>
              ) : (
                videos.map((video) => (
                  <div className="video-item" key={video.id}>
                    <div className="video-thumb">▶</div>
                    <div className="video-meta">
                      <b title={video.originalName}>{video.originalName}</b>
                      <small>
                        {formatBytes(video.size)} ·{" "}
                        {dateLabel(video.uploadedAt)}
                      </small>
                    </div>
                    <button
                      className="delete-button"
                      disabled={active?.videoId === video.id}
                      onClick={() => deleteVideo(video)}
                      title="Delete video"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel" id="stream-setup">
            <div className="panel-heading">
              <div>
                <h2>Stream setup</h2>
                <p className="muted">Configure and control your broadcast.</p>
              </div>
              <span className={`live-badge ${isLive ? "is-live" : ""}`}>
                <i /> {isLive ? active.status.toUpperCase() : "READY"}
              </span>
            </div>
            <form onSubmit={startStream}>
              <label className="field-label" htmlFor="video-select">
                Select video
              </label>
              <select
                id="video-select"
                value={selectedId}
                onChange={(e) => setSelectedVideoId(e.target.value)}
                disabled={!videos.length || isLive}
                required
              >
                {!videos.length && (
                  <option value="">Upload a video first</option>
                )}
                {videos.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.originalName}
                  </option>
                ))}
              </select>
              <label className="field-label" htmlFor="destination">
                RTMP destination URL
              </label>
              <input
                id="destination"
                type="password"
                autoComplete="off"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="rtmp://…/live2"
                disabled={isLive}
                required
              />
              <div className="privacy-note">
                <span>♢</span>
                <span>
                  Keep your RTMP URL and stream key private. This demo doesn't
                  store it in the video metadata, but it is passed to FFmpeg
                  locally.
                </span>
              </div>
              <label className="toggle-row">
                <span>
                  <b>Loop video continuously</b>
                  <small>Restart playback when the video ends.</small>
                </span>
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => setLoop(e.target.checked)}
                  disabled={isLive}
                />
                <span className="toggle" />
              </label>
              {!isLive ? (
                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || !videos.length}
                >
                  <span>▶</span> {busy ? "Starting…" : "Start streaming"}
                </button>
              ) : (
                <button
                  className="stop-button"
                  type="button"
                  onClick={stopStream}
                  disabled={busy}
                >
                  ■ &nbsp; {busy ? "Stopping…" : "Stop stream"}
                </button>
              )}
            </form>

            <div className="stream-status">
              <div className="status-visual">
                <span className={`pulse ${isLive ? "on" : ""}`} />
                <span>▶</span>
              </div>
              <div>
                <b>{isLive ? "Stream process running" : "No active stream"}</b>
                <small>
                  {isLive
                    ? `${activeVideo?.originalName || active.filename} · Started ${timeLabel(active.startedAt)}`
                    : "Your current stream status appears here."}
                </small>
              </div>
            </div>
            {active?.message && (
              <p className="stream-message">{active.message}</p>
            )}
            {active?.logs?.length > 0 && (
              <div className="ffmpeg-logs">
                <div className="log-title">
                  <b>FFmpeg output</b>
                  <span>LAST {active.logs.length} LINES</span>
                </div>
                {active.logs.slice(-5).map((line, i) => (
                  <code key={`${i}-${line}`}>{line}</code>
                ))}
              </div>
            )}
            <div className="log-wrap">
              <div className="log-title">
                <b>Activity log</b>
                <span>RECENT</span>
              </div>
              <div className="activity-log">
                {status.history?.length ? (
                  status.history.slice(0, 7).map((item) => (
                    <div className="log-entry" key={item.id}>
                      <div>
                        <b>{item.message}</b>
                        <small>{timeLabel(item.at)}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="log-empty">
                    Your recent activity will appear here.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
        <footer>
          <span>StreamAdda Studio · React + Express MVP</span>
          <span>Local prototype · No account system</span>
        </footer>
      </main>
    </div>
  );
}
