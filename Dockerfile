# Production Dockerfile for StreamAdda (Node.js 22 + FFmpeg)
FROM node:22-alpine

# Install FFmpeg and basic build dependencies
RUN apk add --no-cache ffmpeg bash curl

WORKDIR /app

# Install dependencies first for optimal caching
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Build React frontend
RUN npm run build

# Expose StreamAdda unified port
EXPOSE 5000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV API_PORT=5000
ENV CLIENT_ORIGIN=*
ENV FFMPEG_PATH=ffmpeg

# Start Express server (serves frontend + streaming API + FFmpeg)
CMD ["node", "server/index.js"]
