# StreamingAdda Project Context & Memory

## Overview
- **Repository**: [https://github.com/Shreyansh927/streamingAdda-Project.git](https://github.com/Shreyansh927/streamingAdda-Project.git)
- **Directory**: `C:\Users\sanke\Streaming adda`
- **Type**: Full-stack 24/7 Cloud Video Streaming Studio (inspired by StreamAdda, GoLive India, and Live Karo).

## Tech Stack
- **Frontend**: React 19, Vite 6, Native CSS with Dynamic Obsidian Dark & Slate Light Design System
- **Backend**: Node.js (v22.17.0), Express 5, Multer (file & logo uploads), dotenv, cors
- **Streaming Core**: FFmpeg (v8.1.1 on Windows, Alpine FFmpeg in Docker)
- **Containerization**: Dockerfile (Node.js 22 + FFmpeg) & `docker-compose.yml`
- **Storage**: Local filesystem (`server/uploads/`, `server/uploads/watermarks/`, and JSON DBs in `server/data/`)

## Port Configuration
- **Development**:
  - Frontend: `http://127.0.0.1:3005`
  - Backend API: `http://127.0.0.1:5000`
- **Production (Cloud / Docker / PM2)**:
  - Unified on port `5000` (`http://0.0.0.0:5000`), serving compiled React frontend and streaming API together.

## Implemented Features (Completed Session 1)
1. **Multi-Destination Simulcasting**: Broadcast single video/playlist to YouTube, Facebook Live, Twitch, Kick, and Instagram simultaneously via FFmpeg `tee` muxer with fail-safe isolation (`[f=flv:onfail=ignore]`).
2. **Channel Presets & Stream Key Manager**: Pre-configured RTMP server endpoints with quick platform selection and masked stream keys.
3. **Multi-Slot Architecture**: Run multiple concurrent streams (Slot 1, Slot 2, Slot N) with independent child processes and controls.
4. **Continuous Sequential Playlists**: Combine multiple videos to broadcast in order in an endless 24/7 loop using FFmpeg concat demuxer.
5. **Real-Time Logo & Watermark Overlay**: Burn transparent PNG logos onto the live stream in real time with selectable positioning (top-right, top-left, bottom-right, bottom-left).
6. **Direct Web Video Downloader**: Import video files directly from web URLs (`.mp4`, `.webm`, `.mov`, `.mkv`) into the server library without local uploading.
7. **Obsidian Dark & Clean Light Themes**: Instant, persisted theme toggling between dark obsidian mode and slate light mode.
8. **Stream Quality Presets**: 720p HD (2500k), 1080p Full HD (4500k), 480p SD (1200k).
9. **One-Click Startup**: Windows `start_dev_servers.bat` batch file.
10. **Attractive Documentation**: Comprehensive `README.md` with architecture diagram, badges, and platform presets.
11. **Cloud & Container Ready**: Added production `Dockerfile` and `docker-compose.yml` for zero-card deployment on Hugging Face Spaces, Render, or any VPS.

## Next Steps / Agenda for Tomorrow
1. **Free Cloud Deployment (No Credit Card)**:
   - Deploy to **Hugging Face Spaces (Docker)** (Free 2 vCPU + 16 GB RAM) or **Render.com** using the newly created `Dockerfile`.
   - Or test zero-cost **Cloudflare Tunnel** for instant public access from your PC.
2. **Automated Stream Scheduler**:
   - Add scheduled start & stop times or recurring 24/7 time slots for streams.
3. **Auto-Reconnect Guard**:
   - Automatic retry and reconnect mechanism if YouTube / Facebook drops connection during 24/7 broadcasting.

## Setup & Execution Commands
- Double-click or run: `start_dev_servers.bat`
- Start dev (both API + frontend): `npm run dev`
- Client only: `npm run dev:client`
- Backend only: `npm run dev:server`
- Docker: `docker compose up --build -d`
