# StreamingAdda Project Context & Memory

## Overview
- **Repository**: [https://github.com/Shreyansh927/streamingAdda-Project.git](https://github.com/Shreyansh927/streamingAdda-Project.git)
- **Directory**: `C:\Users\sanke\Streaming adda`
- **Type**: Full-stack local MVP for 24/7 or on-demand video streaming inspired by cloud live-streaming dashboards (StreamAdda style).

## Tech Stack
- **Frontend**: React 19, Vite 6, Native CSS
- **Backend**: Node.js (v22.17.0), Express 5, Multer (file uploads), dotenv, cors
- **Streaming Engine**: FFmpeg (v8.1.1 installed in system PATH)
- **Storage**: Local filesystem (`server/uploads/` for video files, `server/data/videos.json` for metadata)

## Port Configuration
- **Frontend**: `http://127.0.0.1:3005`
- **Backend API**: `http://127.0.0.1:5000`

## Core Features Present
- **Multi-Destination Simulcasting**: Broadcast to multiple RTMP destinations simultaneously using FFmpeg `tee` muxer with `onfail=ignore` fallback.
- **Saved Channels Manager**: Pre-configured presets for YouTube, Facebook Live, Twitch, Kick, Instagram, and Custom RTMP.
- **Sequential Playlists**: Chain multiple videos to stream sequentially in a continuous 24/7 loop using FFmpeg concat demuxer.
- **Direct URL Video Downloader**: Import web videos directly from MP4/video URLs into the local library without downloading to PC.
- **Real-Time Logo & Watermark Overlay**: Burn channel logos (PNG) into the live stream in real time with customizable positioning (top-right, top-left, bottom-right, bottom-left).
- **Multi-Slot Concurrent Streaming**: Manage multiple independent streaming slots (Slot 1, Slot 2, Slot N) with independent child processes and controls.
- **Stream Quality Presets**: Selectable 720p HD, 1080p Full HD, or 480p SD encoding bitrate presets.
- **Continuous 24/7 Looping**: Uninterrupted playback looping via FFmpeg `-stream_loop -1`.
- **Video Library & Preview**: Upload (MP4, MKV, MOV, WebM, M4V), deletion, and modal HTML5 video player preview.
- **Minimalist Modern Studio UI**: Clean, responsive design with instantaneous **Dark & Light Mode** switching (persisted via localStorage), real-time slot switching, telemetry badges, and live log stream.

## Setup & Execution Commands
- Double-click or run: `start_dev_servers.bat`
- Start dev (both API + frontend): `npm run dev`
- Client only: `npm run dev:client`
- Backend only: `npm run dev:server`
