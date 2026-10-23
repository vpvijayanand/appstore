#!/bin/bash
# deploy.sh — Run this on your Hostinger Ubuntu VPS after cloning the repo
# Usage: chmod +x scripts/deploy.sh && ./scripts/deploy.sh YOUR_DOMAIN

set -e

DOMAIN=${1:-"wlstore.example.com"}
echo "🚀 Deploying WL BizStore to $DOMAIN..."

# ── 1. Install Docker + Compose ───────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
fi

if ! command -v docker-compose &> /dev/null; then
  echo "📦 Installing Docker Compose..."
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

# ── 2. Create .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "⚙️  Creating .env file..."
  cat > .env << EOF
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CORS_ORIGIN=https://$DOMAIN
EOF
  echo "✅ .env created (JWT secrets auto-generated)"
fi

# ── 3. Set domain in nginx config ─────────────────────────────────────────────
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx/nginx.conf
echo "✅ Nginx configured for $DOMAIN"

# ── 4. Start services (without nginx first) ───────────────────────────────────
echo "🐳 Starting Docker services..."
docker-compose up -d postgres minio backend admin-portal

# ── 5. Run migrations + seed ──────────────────────────────────────────────────
echo "🗄️  Running database migrations..."
sleep 10  # wait for postgres to be ready
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend node -e "require('./dist/prisma/seed.js')" || echo "Seed skipped (already run)"

# ── 6. Get SSL certificate with Let's Encrypt ─────────────────────────────────
echo "🔒 Getting SSL certificate for $DOMAIN..."
sudo apt-get install -y certbot nginx
sudo certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

# ── 7. Enable nginx with SSL ──────────────────────────────────────────────────
# Uncomment the nginx service in docker-compose.yml, then:
# docker-compose up -d nginx

echo ""
echo "🎉 Deployment complete!"
echo "   Admin Portal: https://$DOMAIN"
echo "   API:          https://$DOMAIN/api"
echo "   MinIO Console: http://$DOMAIN:9001"
echo ""
echo "   Login: admin@worldline.com / Admin@123456"
echo "   ⚠️  CHANGE THE DEFAULT PASSWORD IMMEDIATELY"
