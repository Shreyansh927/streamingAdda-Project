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
    second: "2-digit",
  });
}

const PLATFORM_PRESETS = {
  youtube: { name: "YouTube Live", url: "rtmp://a.rtmp.youtube.com/live2" },
  facebook: { name: "Facebook Live", url: "rtmps://live-api-s.facebook.com:443/rtmp/" },
  twitch: { name: "Twitch", url: "rtmp://live.twitch.tv/app/" },
  kick: { name: "Kick", url: "rtmps://fa723fc1b171.global-contribute.live-video.net/app/" },
  instagram: { name: "Instagram Live", url: "rtmps://live-upload.instagram.com:443/rtmp/" },
  custom: { name: "Custom RTMP", url: "" },
};

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("streamadda_theme") || "dark";
  });
  const [activeTab, setActiveTab] = useState("studio"); // 'studio' | 'playlists' | 'channels' | 'library'
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [watermarks, setWatermarks] = useState([]);
  const [status, setStatus] = useState({
    slots: [],
    active: null,
    activeCount: 0,
    history: [],
    videoCount: 0,
    channelCount: 0,
    playlistCount: 0,
    watermarkCount: 0,
  });

  // Slot Management
  const [selectedSlotId, setSelectedSlotId] = useState("slot-1");
  const [newSlotModal, setNewSlotModal] = useState(false);
  const [newSlotName, setNewSlotName] = useState("");

  // Studio Stream Form
  const [sourceMode, setSourceMode] = useState("video"); // 'video' | 'playlist'
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);
  const [customDestination, setCustomDestination] = useState("");
  const [loop, setLoop] = useState(true);
  const [quality, setQuality] = useState("720p");
  const [selectedWatermarkId, setSelectedWatermarkId] = useState("");
  const [watermarkPosition, setWatermarkPosition] = useState("top-right");
  const [busy, setBusy] = useState(false);

  // Upload & UI State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importUrl, setImportUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [notice, setNotice] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const fileRef = useRef(null);
  const watermarkFileRef = useRef(null);

  // Modals
  const [channelModal, setChannelModal] = useState(false);
  const [channelForm, setChannelForm] = useState({
    name: "",
    platform: "youtube",
    serverUrl: PLATFORM_PRESETS.youtube.url,
    streamKey: "",
  });

  const [playlistModal, setPlaylistModal] = useState(false);
  const [playlistForm, setPlaylistForm] = useState({
    name: "",
    videoIds: [],
  });

  const notify = (text, type = "info") => setNotice({ text, type });

  const request = async (url, options = {}) => {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const loadStatus = useCallback(async () => {
    try {
      const data = await request(`${API}/status`);
      setStatus(data);
    } catch {}
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [vids, chs, pls, wms] = await Promise.all([
        request(`${API}/videos`),
        request(`${API}/channels`),
        request(`${API}/playlists`),
        request(`${API}/watermarks`),
      ]);
      setVideos(vids);
      setChannels(chs);
      setPlaylists(pls);
      setWatermarks(wms);
    } catch (e) {
      notify(e.message, "error");
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("streamadda_theme", theme);
  }, [theme]);

  useEffect(() => {
    loadAllData();
    loadStatus();
    const timer = setInterval(loadStatus, 2000);
    return () => clearInterval(timer);
  }, [loadAllData, loadStatus]);

  // Current slot
  const currentSlot = useMemo(() => {
    return status.slots?.find((s) => s.id === selectedSlotId) || status.slots?.[0] || {
      id: "slot-1",
      name: "Slot 1 (Main Stream)",
      active: null,
    };
  }, [status.slots, selectedSlotId]);

  const isSlotLive = Boolean(currentSlot?.active);

  // Defaults
  const effectiveVideoId = videos.some((v) => v.id === selectedVideoId)
    ? selectedVideoId
    : videos[0]?.id || "";

  const effectivePlaylistId = playlists.some((p) => p.id === selectedPlaylistId)
    ? selectedPlaylistId
    : playlists[0]?.id || "";

  // Channel toggle
  const toggleChannel = (id) => {
    setSelectedChannelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Video File Upload
  const uploadVideo = (file) => {
    if (!file) return;
    const allowed = /\.(mp4|mov|mkv|webm|m4v)$/i.test(file.name);
    if (!allowed) return notify("Supported formats: MP4, MOV, MKV, WebM, M4V.", "error");

    setUploading(true);
    setUploadProgress(0);
    setNotice(null);

    const form = new FormData();
    form.append("video", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/videos`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = async () => {
      setUploading(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setVideos((prev) => [data, ...prev]);
          setSelectedVideoId(data.id);
          notify(`"${data.originalName}" uploaded.`, "success");
          if (fileRef.current) fileRef.current.value = "";
          await loadStatus();
        } else {
          notify(data.error || "Upload failed.", "error");
        }
      } catch {
        notify("Invalid server response.", "error");
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      notify("Network error during upload.", "error");
    };
    xhr.send(form);
  };

  // Direct URL Import
  const handleImportUrl = async (e) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImportingUrl(true);
    try {
      const data = await request(`${API}/videos/import-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      setVideos((prev) => [data, ...prev]);
      setImportUrl("");
      notify(`Downloaded "${data.originalName}" from URL.`, "success");
      await loadStatus();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setImportingUrl(false);
    }
  };

  const deleteVideo = async (video) => {
    if (!window.confirm(`Delete "${video.originalName}"?`)) return;
    try {
      await request(`${API}/videos/${video.id}`, { method: "DELETE" });
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      notify("Video deleted.", "success");
      await loadStatus();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  // Watermark upload
  const uploadWatermarkLogo = async (file) => {
    if (!file) return;
    const form = new FormData();
    form.append("logo", file);
    form.append("name", file.name);

    try {
      const res = await fetch(`${API}/watermarks`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Watermark upload failed.");
      setWatermarks((prev) => [...prev, data]);
      setSelectedWatermarkId(data.id);
      notify(`Logo "${data.name}" uploaded.`, "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const deleteWatermark = async (id, name) => {
    if (!window.confirm(`Delete watermark "${name}"?`)) return;
    try {
      await request(`${API}/watermarks/${id}`, { method: "DELETE" });
      setWatermarks((prev) => prev.filter((w) => w.id !== id));
      if (selectedWatermarkId === id) setSelectedWatermarkId("");
      notify("Logo removed.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  // Channel Actions
  const handlePlatformChange = (p) => {
    setChannelForm((prev) => ({
      ...prev,
      platform: p,
      serverUrl: PLATFORM_PRESETS[p]?.url || "",
    }));
  };

  const saveChannel = async (e) => {
    e.preventDefault();
    if (!channelForm.name.trim()) return notify("Channel name is required.", "error");
    try {
      const data = await request(`${API}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channelForm),
      });
      setChannels((prev) => [...prev, data]);
      setChannelModal(false);
      setChannelForm({
        name: "",
        platform: "youtube",
        serverUrl: PLATFORM_PRESETS.youtube.url,
        streamKey: "",
      });
      notify(`Channel "${data.name}" added.`, "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const deleteChannel = async (id, name) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    try {
      await request(`${API}/channels/${id}`, { method: "DELETE" });
      setChannels((prev) => prev.filter((c) => c.id !== id));
      setSelectedChannelIds((prev) => prev.filter((item) => item !== id));
      notify("Channel deleted.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  // Playlist Actions
  const togglePlaylistVideo = (videoId) => {
    setPlaylistForm((prev) => {
      const exists = prev.videoIds.includes(videoId);
      return {
        ...prev,
        videoIds: exists
          ? prev.videoIds.filter((id) => id !== videoId)
          : [...prev.videoIds, videoId],
      };
    });
  };

  const savePlaylist = async (e) => {
    e.preventDefault();
    if (!playlistForm.name.trim()) return notify("Playlist name is required.", "error");
    if (playlistForm.videoIds.length === 0) return notify("Select at least one video.", "error");

    try {
      const data = await request(`${API}/playlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(playlistForm),
      });
      setPlaylists((prev) => [...prev, data]);
      setPlaylistModal(false);
      setPlaylistForm({ name: "", videoIds: [] });
      setSelectedPlaylistId(data.id);
      notify(`Playlist "${data.name}" created.`, "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const deletePlaylist = async (id, name) => {
    if (!window.confirm(`Delete playlist "${name}"?`)) return;
    try {
      await request(`${API}/playlists/${id}`, { method: "DELETE" });
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      notify("Playlist deleted.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  // Slot Management
  const addSlot = async (e) => {
    e.preventDefault();
    if (!newSlotName.trim()) return;
    try {
      const data = await request(`${API}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSlotName.trim() }),
      });
      setNewSlotModal(false);
      setNewSlotName("");
      setSelectedSlotId(data.id);
      await loadStatus();
      notify(`Slot "${data.name}" created.`, "success");
    } catch (err) {
      notify(err.message, "error");
    }
  };

  // Start Stream in Current Slot
  const handleStartStream = async (e) => {
    e.preventDefault();

    if (sourceMode === "video" && !effectiveVideoId) {
      return notify("Upload and select a video first.", "error");
    }
    if (sourceMode === "playlist" && !effectivePlaylistId) {
      return notify("Create and select a playlist first.", "error");
    }

    if (selectedChannelIds.length === 0 && !customDestination.trim()) {
      return notify("Select at least one destination channel or enter an RTMP URL.", "error");
    }

    setBusy(true);
    try {
      const data = await request(`${API}/slots/${currentSlot.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: sourceMode,
          videoId: sourceMode === "video" ? effectiveVideoId : undefined,
          playlistId: sourceMode === "playlist" ? effectivePlaylistId : undefined,
          channelIds: selectedChannelIds,
          destination: customDestination.trim() || undefined,
          loop,
          quality,
          watermarkId: selectedWatermarkId || undefined,
          watermarkPosition,
        }),
      });
      notify(data.message || "Stream started successfully.", "success");
      await loadStatus();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  // Stop Stream in Current Slot
  const handleStopStream = async () => {
    setBusy(true);
    try {
      const data = await request(`${API}/slots/${currentSlot.id}/stop`, { method: "POST" });
      notify(data.message || "Stream stopped.", "success");
      await loadStatus();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">▶</div>
          <div>
            <div className="logo-text">StreamAdda</div>
            <div className="logo-sub">Cloud Studio</div>
          </div>
        </div>

        <div className="nav-group-title">Navigation</div>
        <button
          className={`nav-btn ${activeTab === "studio" ? "active" : ""}`}
          onClick={() => setActiveTab("studio")}
        >
          <span>◉</span> Live Studio
          {status.activeCount > 0 && (
            <span className="nav-badge live">{status.activeCount} Live</span>
          )}
        </button>
        <button
          className={`nav-btn ${activeTab === "playlists" ? "active" : ""}`}
          onClick={() => setActiveTab("playlists")}
        >
          <span>☵</span> Playlists
          <span className="nav-badge">{playlists.length}</span>
        </button>
        <button
          className={`nav-btn ${activeTab === "channels" ? "active" : ""}`}
          onClick={() => setActiveTab("channels")}
        >
          <span>⇋</span> Channels & Logos
          <span className="nav-badge">{channels.length}</span>
        </button>
        <button
          className={`nav-btn ${activeTab === "library" ? "active" : ""}`}
          onClick={() => setActiveTab("library")}
        >
          <span>▣</span> Video Library
          <span className="nav-badge">{videos.length}</span>
        </button>

        <div className="sidebar-footer">
          <div>StreamingAdda Studio v2.5</div>
          <div>Multi-Destination · Playlists · 24/7 Engine</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-header">
          <div className="header-title-group">
            <h1>
              {activeTab === "studio" && "Live Broadcast Studio"}
              {activeTab === "playlists" && "Continuous Video Playlists"}
              {activeTab === "channels" && "Destinations & Brand Watermarks"}
              {activeTab === "library" && "Video Asset Library & Downloader"}
            </h1>
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle-btn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
            >
              <span>{theme === "dark" ? "☼" : "☽"}</span>
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <div className="system-status-chip">
              <span className={`status-beacon ${status.activeCount > 0 ? "active" : ""}`} />
              <span>{status.activeCount > 0 ? `${status.activeCount} Active Stream(s)` : "Engine Ready"}</span>
            </div>
          </div>
        </header>

        <div className="page-container">
          {/* Notifications */}
          {notice && (
            <div className={`alert-box ${notice.type}`} role="status">
              <span>{notice.text}</span>
              <button className="alert-close" onClick={() => setNotice(null)}>×</button>
            </div>
          )}

          {/* ===================== TAB 1: LIVE STUDIO ===================== */}
          {activeTab === "studio" && (
            <div>
              {/* Stat Row */}
              <div className="stat-row">
                <div className="stat-card">
                  <div className="stat-label">Active Slots</div>
                  <div className="stat-value">{status.activeCount} / {status.slots?.length || 2}</div>
                  <div className="stat-desc">Concurrent streams live</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Playlists Ready</div>
                  <div className="stat-value">{playlists.length}</div>
                  <div className="stat-desc">Sequential loop sequences</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Channels Connected</div>
                  <div className="stat-value">{channels.length}</div>
                  <div className="stat-desc">Simulcast destinations</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Video Library</div>
                  <div className="stat-value">{videos.length}</div>
                  <div className="stat-desc">Stored source files</div>
                </div>
              </div>

              {/* Slot Switcher Tabs */}
              <div className="slot-bar">
                {status.slots?.map((slot) => {
                  const isLive = Boolean(slot.active);
                  const isSelected = slot.id === currentSlot.id;
                  return (
                    <button
                      key={slot.id}
                      className={`slot-tab ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedSlotId(slot.id)}
                    >
                      <span className={`slot-status-dot ${isLive ? "live" : ""}`} />
                      <span>{slot.name}</span>
                      {isLive && <span className="nav-badge live">LIVE</span>}
                    </button>
                  );
                })}
                <button className="add-slot-btn" onClick={() => setNewSlotModal(true)}>
                  + Add Slot
                </button>
              </div>

              {/* Studio Grid */}
              <div className="studio-grid">
                {/* Left Panel: Stream Configuration */}
                <div className="studio-panel">
                  <div className="panel-header">
                    <div>
                      <h2>{currentSlot.name} Controls</h2>
                      <div className="sub">Select source, destinations, and overlay branding</div>
                    </div>
                  </div>

                  <form onSubmit={handleStartStream}>
                    {/* Source Switcher: Single Video vs Playlist */}
                    <div className="form-group">
                      <label className="form-label">Broadcast Source Mode</label>
                      <div className="mode-switch-group">
                        <button
                          type="button"
                          className={`mode-switch-btn ${sourceMode === "video" ? "active" : ""}`}
                          onClick={() => !isSlotLive && setSourceMode("video")}
                        >
                          Single Video
                        </button>
                        <button
                          type="button"
                          className={`mode-switch-btn ${sourceMode === "playlist" ? "active" : ""}`}
                          onClick={() => !isSlotLive && setSourceMode("playlist")}
                        >
                          Sequential Playlist ({playlists.length})
                        </button>
                      </div>

                      {sourceMode === "video" ? (
                        <select
                          className="form-select"
                          value={effectiveVideoId}
                          onChange={(e) => setSelectedVideoId(e.target.value)}
                          disabled={isSlotLive || !videos.length}
                          required
                        >
                          {!videos.length && <option value="">Upload a video in the Library tab first</option>}
                          {videos.map((v) => (
                            <option value={v.id} key={v.id}>
                              {v.originalName} ({formatBytes(v.size)})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className="form-select"
                          value={effectivePlaylistId}
                          onChange={(e) => setSelectedPlaylistId(e.target.value)}
                          disabled={isSlotLive || !playlists.length}
                          required
                        >
                          {!playlists.length && <option value="">Create a playlist in the Playlists tab first</option>}
                          {playlists.map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.name} ({p.videoIds?.length || 0} videos)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Destinations: Multi-Destination Simulcasting */}
                    <div className="form-group">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Destinations (Multi-Cast Simulcast)
                        </label>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: "2px 8px", fontSize: "10px" }}
                          onClick={() => setActiveTab("channels")}
                        >
                          + Manage Channels
                        </button>
                      </div>

                      {channels.length === 0 ? (
                        <div style={{ padding: "12px", background: "var(--bg-surface-elevated)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--text-dim)" }}>
                          No channels saved yet. <a href="#channels" onClick={() => setActiveTab("channels")} style={{ color: "var(--accent-primary)" }}>Add your YouTube or Facebook stream keys</a> or enter a custom RTMP destination below.
                        </div>
                      ) : (
                        <div className="channels-selector-box">
                          {channels.map((ch) => {
                            const isChecked = selectedChannelIds.includes(ch.id);
                            return (
                              <div
                                key={ch.id}
                                className={`channel-check-row ${isChecked ? "selected" : ""}`}
                                onClick={() => !isSlotLive && toggleChannel(ch.id)}
                              >
                                <div className="channel-row-left">
                                  <div className={`checkbox-custom ${isChecked ? "checked" : ""}`}>
                                    {isChecked ? "✓" : ""}
                                  </div>
                                  <span className={`platform-tag ${ch.platform}`}>{ch.platform}</span>
                                  <span style={{ fontSize: "12px", color: "var(--text-main)" }}>{ch.name}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Optional Custom RTMP */}
                    <div className="form-group">
                      <label className="form-label">Or Custom RTMP URL (Optional)</label>
                      <input
                        className="form-input"
                        type="password"
                        placeholder="rtmp://.../live2/key"
                        value={customDestination}
                        onChange={(e) => setCustomDestination(e.target.value)}
                        disabled={isSlotLive}
                      />
                    </div>

                    {/* Watermark / Logo Overlay */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "12px", marginBottom: "16px" }}>
                      <div>
                        <label className="form-label">Live Logo / Watermark</label>
                        <select
                          className="form-select"
                          value={selectedWatermarkId}
                          onChange={(e) => setSelectedWatermarkId(e.target.value)}
                          disabled={isSlotLive}
                        >
                          <option value="">None (Standard)</option>
                          {watermarks.map((w) => (
                            <option value={w.id} key={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="form-label">Logo Position</label>
                        <select
                          className="form-select"
                          value={watermarkPosition}
                          onChange={(e) => setWatermarkPosition(e.target.value)}
                          disabled={isSlotLive || !selectedWatermarkId}
                        >
                          <option value="top-right">Top Right</option>
                          <option value="top-left">Top Left</option>
                          <option value="bottom-right">Bottom Right</option>
                          <option value="bottom-left">Bottom Left</option>
                        </select>
                      </div>
                    </div>

                    {/* Quality & Looping */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "18px" }}>
                      <div>
                        <label className="form-label">Quality Preset</label>
                        <select
                          className="form-select"
                          value={quality}
                          onChange={(e) => setQuality(e.target.value)}
                          disabled={isSlotLive}
                        >
                          <option value="720p">720p HD (2500 kbps)</option>
                          <option value="1080p">1080p Full HD (4500 kbps)</option>
                          <option value="480p">480p SD (1200 kbps)</option>
                        </select>
                      </div>

                      <div className="toggle-item" style={{ paddingTop: "14px" }} onClick={() => !isSlotLive && setLoop(!loop)}>
                        <div>
                          <b>Loop Continuously</b>
                          <small>Restart 24/7 on finish</small>
                        </div>
                        <div className={`switch-pill ${loop ? "on" : ""}`}>
                          <div className="switch-knob" />
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    {!isSlotLive ? (
                      <button
                        className="btn-primary"
                        type="submit"
                        disabled={busy || (!videos.length && !playlists.length)}
                      >
                        <span>▶</span> {busy ? "Starting Stream..." : `Start Stream on ${currentSlot.name}`}
                      </button>
                    ) : (
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={handleStopStream}
                        disabled={busy}
                      >
                        <span>■</span> {busy ? "Stopping..." : `Stop Stream on ${currentSlot.name}`}
                      </button>
                    )}
                  </form>
                </div>

                {/* Right Panel: Live Monitor */}
                <div className="studio-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Stream Telemetry</h2>
                      <div className="sub">Live monitor for {currentSlot.name}</div>
                    </div>
                  </div>

                  <div className="monitor-card">
                    <div className="monitor-status-row">
                      <span className={`monitor-badge ${isSlotLive ? "streaming" : ""}`}>
                        <span className={`slot-status-dot ${isSlotLive ? "live" : ""}`} />
                        {isSlotLive ? (currentSlot.active?.status?.toUpperCase() || "LIVE") : "IDLE"}
                      </span>
                      {isSlotLive && (
                        <span style={{ fontSize: "11px", color: "var(--accent-success)" }}>
                          Started {timeLabel(currentSlot.active?.startedAt)}
                        </span>
                      )}
                    </div>

                    <div className="monitor-meta">
                      <div>
                        <b style={{ color: "var(--text-main)" }}>
                          {isSlotLive ? currentSlot.active?.title : "No active broadcast"}
                        </b>
                      </div>
                      {isSlotLive && currentSlot.active?.destinations?.length > 0 && (
                        <div>
                          <small style={{ color: "var(--text-dim)" }}>Broadcasting to:</small>
                          <div className="target-pills-wrap">
                            {currentSlot.active.destinations.map((dest, i) => (
                              <span key={i} className="target-pill">
                                📡 {dest}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {isSlotLive && currentSlot.active?.watermark && (
                        <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                          Watermark Overlay: {currentSlot.active.watermark}
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
                        {isSlotLive ? currentSlot.active?.message : "Configure source and channels to begin."}
                      </div>
                    </div>
                  </div>

                  {/* Terminal FFmpeg Logs */}
                  <div className="form-label" style={{ marginTop: "16px", marginBottom: "6px" }}>
                    FFmpeg Engine Output
                  </div>
                  <div className="log-box">
                    {currentSlot.active?.logs?.length > 0 ? (
                      currentSlot.active.logs.map((log, i) => (
                        <div key={i} className="log-line">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "var(--text-dim)" }}>No active process logs for this slot.</div>
                    )}
                  </div>

                  {/* Recent Activity */}
                  <div className="form-label" style={{ marginTop: "18px", marginBottom: "6px" }}>
                    Activity History
                  </div>
                  <div style={{ maxHeight: "120px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {status.history?.length ? (
                      status.history.slice(0, 5).map((item) => (
                        <div key={item.id} style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                          <span>{item.message}</span>
                          <span style={{ color: "var(--text-dim)" }}>{timeLabel(item.at)}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>No activity recorded yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================== TAB 2: PLAYLISTS ===================== */}
          {activeTab === "playlists" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                  <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Continuous Playlists</h2>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Chain multiple videos to play sequentially in an endless 24/7 loop.
                  </p>
                </div>
                <button
                  className="btn-primary"
                  style={{ width: "auto" }}
                  disabled={videos.length === 0}
                  onClick={() => setPlaylistModal(true)}
                >
                  + Create Playlist
                </button>
              </div>

              {playlists.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>☵</div>
                  <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>No Playlists Created</div>
                  <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>
                    {videos.length === 0
                      ? "Upload some videos in the Video Library first."
                      : "Create a playlist to loop multiple videos sequentially on your stream."}
                  </p>
                  {videos.length > 0 && (
                    <button className="btn-primary" style={{ width: "auto", margin: "0 auto" }} onClick={() => setPlaylistModal(true)}>
                      + Create Your First Playlist
                    </button>
                  )}
                </div>
              ) : (
                <div className="playlist-grid">
                  {playlists.map((pl) => (
                    <div key={pl.id} className="playlist-card">
                      <div>
                        <div className="playlist-card-top">
                          <div className="playlist-card-icon">☵</div>
                          <div className="playlist-card-info">
                            <div className="playlist-card-title">{pl.name}</div>
                            <div className="playlist-card-meta">
                              {pl.videoIds?.length || 0} video(s) in sequence
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "12px" }}>
                          Created: {new Date(pl.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="playlist-card-actions">
                        <button
                          className="btn-secondary"
                          style={{ padding: "4px 10px", fontSize: "11px" }}
                          onClick={() => {
                            setSourceMode("playlist");
                            setSelectedPlaylistId(pl.id);
                            setActiveTab("studio");
                          }}
                        >
                          Select for Stream
                        </button>
                        <button className="btn-icon-danger" onClick={() => deletePlaylist(pl.id, pl.name)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===================== TAB 3: CHANNELS & WATERMARKS ===================== */}
          {activeTab === "channels" && (
            <div>
              {/* Section 1: RTMP Channels */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Stream Channels (Destinations)</h2>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Pre-save destination RTMP endpoints to broadcast to multiple platforms at once.
                  </p>
                </div>
                <button className="btn-primary" style={{ width: "auto" }} onClick={() => setChannelModal(true)}>
                  + Add Stream Channel
                </button>
              </div>

              {channels.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", marginBottom: "32px" }}>
                  <div style={{ fontSize: "24px", marginBottom: "6px" }}>⇋</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>No Channels Added</div>
                  <p style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "12px" }}>
                    Save your YouTube or Facebook RTMP keys for one-click simulcasting.
                  </p>
                  <button className="btn-primary" style={{ width: "auto", margin: "0 auto" }} onClick={() => setChannelModal(true)}>
                    + Add Channel
                  </button>
                </div>
              ) : (
                <div className="channel-grid" style={{ marginBottom: "32px" }}>
                  {channels.map((ch) => (
                    <div key={ch.id} className="channel-card">
                      <div>
                        <div className="channel-card-header">
                          <span className="channel-card-name">{ch.name}</span>
                          <span className={`platform-tag ${ch.platform}`}>{ch.platform}</span>
                        </div>
                        <div className="channel-card-url">{ch.serverUrl}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "12px" }}>
                          Stream Key: ••••••••••••••••••
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
                        <button className="btn-icon-danger" onClick={() => deleteChannel(ch.id, ch.name)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Section 2: Watermarks & Logos */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
                <div>
                  <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Live Watermark & Channel Logos</h2>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Upload transparent PNG logos to overlay in real-time onto your broadcasts.
                  </p>
                </div>
                <div>
                  <button
                    className="btn-primary"
                    style={{ width: "auto" }}
                    onClick={() => watermarkFileRef.current?.click()}
                  >
                    + Upload Logo (PNG)
                  </button>
                  <input
                    ref={watermarkFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => uploadWatermarkLogo(e.target.files?.[0])}
                  />
                </div>
              </div>

              {watermarks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "24px", marginBottom: "6px" }}>🏷</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>No Logos Uploaded</div>
                  <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                    Upload your channel logo to display it during live broadcasts.
                  </p>
                </div>
              ) : (
                <div className="channel-grid">
                  {watermarks.map((wm) => (
                    <div key={wm.id} className="channel-card" style={{ flexDirection: "row", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <img
                          src={wm.url}
                          alt={wm.name}
                          style={{ width: "44px", height: "44px", objectFit: "contain", background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px" }}
                        />
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "600" }}>{wm.name}</div>
                          <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>Ready for overlay</div>
                        </div>
                      </div>
                      <button className="btn-icon-danger" onClick={() => deleteWatermark(wm.id, wm.name)}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===================== TAB 4: VIDEO LIBRARY ===================== */}
          {activeTab === "library" && (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: "600" }}>Video Assets & Downloader</h2>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Upload local files or download videos directly from web links.
                </p>
              </div>

              {/* Direct URL Downloader Bar */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px" }}>Import from Web Video URL</div>
                <form onSubmit={handleImportUrl} style={{ display: "flex", gap: "10px" }}>
                  <input
                    className="form-input"
                    placeholder="https://example.com/video.mp4"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={importingUrl}
                    required
                  />
                  <button
                    className="btn-primary"
                    style={{ width: "160px", flexShrink: 0 }}
                    type="submit"
                    disabled={importingUrl || !importUrl.trim()}
                  >
                    {importingUrl ? "Downloading..." : "Download URL"}
                  </button>
                </form>
              </div>

              {/* Upload Dropzone */}
              <div
                className={`upload-dropzone ${uploading ? "uploading" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) uploadVideo(e.dataTransfer.files[0]);
                }}
              >
                <div className="upload-icon">↑</div>
                <div className="upload-title">Drop your video here or browse local files</div>
                <div className="upload-subtitle">Supports MP4, MOV, MKV, WebM, M4V (up to 1 GB)</div>
                <button
                  className="btn-primary"
                  style={{ width: "auto", margin: "0 auto" }}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Uploading..." : "Select Local Video"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.m4v"
                  style={{ display: "none" }}
                  onChange={(e) => uploadVideo(e.target.files?.[0])}
                />
                {uploading && (
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
                {uploading && <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "6px" }}>{uploadProgress}% completed</div>}
              </div>

              {/* Videos Grid */}
              <div className="video-grid">
                {videos.map((video) => (
                  <div key={video.id} className="video-card">
                    <div className="video-card-top">
                      <div className="video-card-icon">▶</div>
                      <div className="video-card-info">
                        <div className="video-card-title" title={video.originalName}>
                          {video.originalName}
                        </div>
                        <div className="video-card-meta">
                          {formatBytes(video.size)} · {new Date(video.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="video-card-actions">
                      <button
                        className="btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "11px" }}
                        onClick={() => setPreviewVideo(video)}
                      >
                        Preview
                      </button>
                      <button
                        className="btn-icon-danger"
                        onClick={() => deleteVideo(video)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ===================== MODAL: CREATE PLAYLIST ===================== */}
      {playlistModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create Video Playlist</h3>
              <button className="modal-close-btn" onClick={() => setPlaylistModal(false)}>×</button>
            </div>
            <form onSubmit={savePlaylist}>
              <div className="form-group">
                <label className="form-label">Playlist Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. 24/7 Lo-Fi Chill Beats, Devotional Morning"
                  value={playlistForm.name}
                  onChange={(e) => setPlaylistForm({ ...playlistForm, name: e.target.value })}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Select Videos to Include ({playlistForm.videoIds.length} chosen)</label>
                <div className="channels-selector-box" style={{ maxHeight: "220px" }}>
                  {videos.map((v) => {
                    const isChecked = playlistForm.videoIds.includes(v.id);
                    return (
                      <div
                        key={v.id}
                        className={`channel-check-row ${isChecked ? "selected" : ""}`}
                        onClick={() => togglePlaylistVideo(v.id)}
                      >
                        <div className="channel-row-left">
                          <div className={`checkbox-custom ${isChecked ? "checked" : ""}`}>
                            {isChecked ? "✓" : ""}
                          </div>
                          <span style={{ fontSize: "12px", color: "var(--text-main)" }}>{v.originalName}</span>
                        </div>
                        <small style={{ color: "var(--text-dim)", fontSize: "10px" }}>{formatBytes(v.size)}</small>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setPlaylistModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                  Save Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD CHANNEL ===================== */}
      {channelModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Stream Destination</h3>
              <button className="modal-close-btn" onClick={() => setChannelModal(false)}>×</button>
            </div>
            <form onSubmit={saveChannel}>
              <div className="form-group">
                <label className="form-label">Platform Preset</label>
                <select
                  className="form-select"
                  value={channelForm.platform}
                  onChange={(e) => handlePlatformChange(e.target.value)}
                >
                  <option value="youtube">YouTube Live</option>
                  <option value="facebook">Facebook Live</option>
                  <option value="twitch">Twitch</option>
                  <option value="kick">Kick</option>
                  <option value="instagram">Instagram Live</option>
                  <option value="custom">Custom RTMP</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Channel Nickname</label>
                <input
                  className="form-input"
                  placeholder="e.g. My YouTube Main, FB Page"
                  value={channelForm.name}
                  onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Server RTMP URL</label>
                <input
                  className="form-input"
                  placeholder="rtmp://..."
                  value={channelForm.serverUrl}
                  onChange={(e) => setChannelForm({ ...channelForm, serverUrl: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stream Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Paste stream key here"
                  value={channelForm.streamKey}
                  onChange={(e) => setChannelForm({ ...channelForm, streamKey: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setChannelModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                  Save Destination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: ADD SLOT ===================== */}
      {newSlotModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Stream Slot</h3>
              <button className="modal-close-btn" onClick={() => setNewSlotModal(false)}>×</button>
            </div>
            <form onSubmit={addSlot}>
              <div className="form-group">
                <label className="form-label">Slot Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Slot 3 (Devotional Loop)"
                  value={newSlotName}
                  onChange={(e) => setNewSlotName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setNewSlotModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ width: "auto" }}>
                  Create Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: VIDEO PREVIEW ===================== */}
      {previewVideo && (
        <div className="modal-overlay" onClick={() => setPreviewVideo(null)}>
          <div className="modal-content" style={{ maxWidth: "640px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{previewVideo.originalName}</h3>
              <button className="modal-close-btn" onClick={() => setPreviewVideo(null)}>×</button>
            </div>
            <video
              src={previewVideo.url}
              controls
              autoPlay
              style={{ width: "100%", borderRadius: "var(--radius-sm)", maxHeight: "400px", background: "#000" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
