# Deploy vibegames.it (FastAPI + WebSocket + Caddy HTTPS)

This repo is ready to deploy on a small VPS using Docker Compose and Caddy (auto Let's Encrypt). It serves:
- Python backend (FastAPI + Uvicorn) at `http://app:8765` inside the network
- Public site with HTTPS at `https://vibegames.it` via Caddy reverse proxy

The server also serves the in-browser Canvas UI at `/` and static assets under `/assets`.

## 1) Prerequisites
- A VPS (Ubuntu 22.04+ recommended). 2 CPU / 4GB RAM is comfortable for Torch; 1 CPU / 2GB works but slower.
- Ports 80 and 443 open in your firewall/security group.
- Your domain: `vibegames.it`.

## 2) DNS
Create DNS records at your registrar/host:
- A record: `@` → YOUR_VPS_IP
- CNAME: `www` → `vibegames.it`

Propagation can take a few minutes.

## 3) Install Docker on the VPS
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 4) Get the repo onto the VPS
Option A: push to GitHub and clone:
```bash
git clone <your-repo-url>
cd flappy_ai
```

Option B: copy your local folder directly:
```bash
# On your Mac
cd /Users/giorgiosilvi/Projects
tar czf flappy_ai.tar.gz flappy_ai
scp flappy_ai.tar.gz <user>@<VPS_IP>:~/

# On the VPS
tar xzf ~/flappy_ai.tar.gz
cd ~/flappy_ai
```

## 5) Start the stack
```bash
docker compose up -d
```
This builds the Python image (with CPU-only Torch) and starts two containers:
- `flappy-ai` (FastAPI + Uvicorn on 8765)
- `caddy` (reverse-proxy with HTTPS)

Caddy will automatically request and renew TLS certificates for `vibegames.it` and `www.vibegames.it`.

## 6) Verify
```bash
docker ps
docker logs -f flappy-ai
```
Visit: `https://vibegames.it`

## Notes
- Torch CPU-only wheels are installed from `https://download.pytorch.org/whl/cpu`.
- The AI checkpoint is expected at `FlapPyBird/checkpoints/best.pt`. It is included in this repo.
- If the checkpoint is missing, the app still serves the page; it will just skip starting the AI loop.
- Static assets are served from `FlapPyBird/assets` (mounted at `/assets`).

## Updating
```bash
# pull changes (or recopy files)
# then
docker compose build app
docker compose up -d
```

## Troubleshooting
- If HTTPS fails initially, ensure DNS points to your VPS and ports 80/443 are open.
- If the app fails to start due to pygame/SDL, the provided Dockerfile installs minimal system libs. If needed, add more libs, then rebuild:
```bash
# Example extras (only if required by your host)
apt-get update && apt-get install -y libxext6 libxrender1 libxi6 libxrandr2 libxcursor1 libxinerama1
```


