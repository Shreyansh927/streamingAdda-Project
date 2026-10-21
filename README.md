# StreamAdda Studio — React + Node/Express MVP

A full-stack local demo inspired by cloud video streaming dashboards. It includes a React dashboard, Express REST API, video uploads, a persisted local video library, FFmpeg RTMP streaming, looping, stop controls, and activity logs.

This is an educational MVP, not a production-ready public SaaS and not affiliated with StreamAdda.

## Requirements

- Node.js 20+ (includes npm)
- FFmpeg installed and available in PATH
- A valid RTMP/RTMPS destination you control, if you want to test live streaming

## Run on Windows

1. Extract the ZIP.
2. Open the extracted `streamadda_react_node_full` folder in VS Code.
3. Open **Terminal → New Terminal**. Confirm the terminal path is the project root (the folder containing `package.json`).
4. Install dependencies:

   ```bash
   npm install
   ```

5. Create your local environment file by copying `.env.example` to `.env`. On PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   The default ports are frontend `3005` and API `5000`.

6. Install FFmpeg if you haven't already. For Windows, one option is https://www.gyan.dev/ffmpeg/builds/. Ensure `ffmpeg.exe` is on PATH; reopen VS Code after changing PATH. Verify:

   ```bash
   ffmpeg -version
   ```

7. Start both frontend and backend in one terminal:

   ```bash
   npm run dev
   ```

8. Open **http://127.0.0.1:3005** in your normal browser. Keep the terminal running.

## What to try

1. Upload a small MP4 file.
2. Confirm it appears in the video library.
3. Enter the RTMP/RTMPS URL provided by a streaming destination you control.
4. Choose whether to loop the video.
5. Click Start streaming and check the destination's preview/status.
6. Click Stop stream when done.

Uploading and browsing the library work without FFmpeg. Actual streaming requires FFmpeg and a valid RTMP destination.

## Production limitations / security

- There is no authentication, authorization, multi-tenant isolation, payment, or rate limiting. Do not expose this app to the public internet.
- Videos are stored locally in `server/uploads/`; metadata is stored in `server/data/videos.json`.
- This MVP supports one stream at a time. It does not have a durable worker queue, automatic retry/restart, cloud storage, or billing.
- RTMP destination/stream keys are never written to video metadata and are redacted from FFmpeg log lines, but the destination is passed as an FFmpeg process argument. A local administrator may be able to inspect process arguments. Use a disposable test key and rotate it after testing.
- Confirm stream reception on the destination platform; a running FFmpeg process alone does not prove the platform accepted the stream.
- Stream only content you own or are authorized to broadcast, and follow the platform's rules.

## Troubleshooting

- **`npm` or `node` not recognized:** install Node.js LTS and restart VS Code.
- **Port 3005 in use:** close the other process using it or change `server.port` in `vite.config.js`.
- **Port 5000 in use:** change `API_PORT` in `.env` and update the Vite proxy target in `vite.config.js` to match.
- **Cannot reach API:** run `npm run dev` from the project root and check that both API and WEB processes start.
- **FFmpeg not found:** run `ffmpeg -version`. If it fails, install FFmpeg or set `FFMPEG_PATH` in `.env` to the full path to `ffmpeg.exe`.
- **RTMP rejected:** verify the complete RTMP URL, key, account live-stream settings, and network access.

## Structure

```text
streamadda_react_node_full/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── server/
│   ├── index.js
│   ├── data/videos.json
│   └── uploads/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
└── README.md
```

## Suggested next steps toward production

1. Add user accounts, session security and authorization.
2. Replace JSON metadata storage with PostgreSQL.
3. Store video files in S3-compatible object storage and use signed URLs.
4. Run FFmpeg in isolated background workers with a queue (Redis/BullMQ), resource limits, retries and recovery.
5. Encrypt stream keys at rest and use a safer secret-delivery strategy.
6. Add usage quotas, billing, audit trails, monitoring, cleanup and abuse prevention.
