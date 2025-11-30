#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Flappy AI - Web Client Deployment Script
# ═══════════════════════════════════════════════════════════════════════════
# Usage:
#   ./deploy.sh [DOMAIN]
#
# Default domain is vibegames.it. Run from the repo root on the server.
# Deploys the Vue.js web_client as a static site served by Caddy.
# ═══════════════════════════════════════════════════════════════════════════

DOMAIN="${1:-vibegames.it}"
APP_DIR="$(pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🐦 Flappy AI - Web Client Deploy"
echo "═══════════════════════════════════════════════════════════"
echo "  Domain: $DOMAIN"
echo "  Dir:    $APP_DIR"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 0) Install basic dependencies
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v git >/dev/null 2>&1; then
  echo "📦 Installing git..."
  apt-get update && apt-get install -y git curl
fi

# ─────────────────────────────────────────────────────────────────────────────
# 1) Install Node.js if missing
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "📦 Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "✓ Node.js $(node --version) already installed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2) Install Docker if missing
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
else
  echo "✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',') already installed"
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ Docker Compose plugin not found. Please install a recent Docker version." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3) Build the Vue.js app
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🔨 Building web_client..."
cd "$APP_DIR/web_client"

# Clean install dependencies
npm ci --prefer-offline 2>/dev/null || npm install

# Build for production
npm run build

BUILD_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "unknown")
echo "✓ Build complete (${BUILD_SIZE})"

cd "$APP_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# 4) Create Caddyfile (static file server with SPA support)
# ─────────────────────────────────────────────────────────────────────────────
echo "📝 Creating Caddyfile..."
cat > Caddyfile <<EOF
${DOMAIN}, www.${DOMAIN} {
    # Compression
    encode zstd gzip
    
    # Serve static files from /srv
    root * /srv
    file_server
    
    # SPA fallback: serve index.html for client-side routes
    try_files {path} /index.html
    
    # Cache static assets aggressively (they have content hashes)
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2 *.webp
    }
    header @static Cache-Control "public, max-age=31536000, immutable"
    
    # Don't cache HTML (for updates)
    @html {
        path *.html /
    }
    header @html Cache-Control "no-cache, no-store, must-revalidate"
}
EOF

# ─────────────────────────────────────────────────────────────────────────────
# 5) Create docker-compose.yml (Caddy only - no backend needed!)
# ─────────────────────────────────────────────────────────────────────────────
echo "📝 Creating docker-compose.yml..."
cat > docker-compose.yml <<EOF
# Flappy AI - Static Web Client
# All AI/RL runs in the browser - no backend needed!

services:
  caddy:
    image: caddy:2-alpine
    container_name: flappy-web
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./web_client/dist:/srv:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
EOF

# ─────────────────────────────────────────────────────────────────────────────
# 6) Stop old FlapPyBird containers if running
# ─────────────────────────────────────────────────────────────────────────────
if [ -f "$APP_DIR/FlapPyBird/docker-compose.yml" ]; then
  echo "🛑 Stopping old FlapPyBird containers..."
  cd "$APP_DIR/FlapPyBird"
  docker compose down 2>/dev/null || true
  cd "$APP_DIR"
fi

# Also stop any existing flappy-web container
docker stop flappy-web 2>/dev/null || true
docker rm flappy-web 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# 7) Deploy!
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Starting Caddy..."
docker compose up -d

# Wait a moment for container to start
sleep 2

# Check if running
if docker ps | grep -q flappy-web; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  ✅ Deployment successful!"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  echo "  🌐 Site:  https://${DOMAIN}"
  echo "  📋 Logs:  docker logs -f flappy-web"
  echo "  🔄 Reload: docker compose restart"
  echo ""
else
  echo ""
  echo "❌ Container failed to start. Check logs:"
  echo "   docker logs flappy-web"
  exit 1
fi


