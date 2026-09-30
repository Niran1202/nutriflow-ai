#!/usr/bin/env bash
# NutriFlow AI — server setup on an Oracle Cloud Ubuntu VM (Ampere A1 / ARM or x86).
# Run by deploy.sh on the VM:  sudo bash setup.sh <domain>
# Safe to re-run: every step checks what's already there.
set -euo pipefail

DOMAIN="${1:?usage: setup.sh <domain>}"
APP_DIR=/opt/nutriflow/app
APP_USER=nutriflow
MODEL=llama3.2:3b

log() { printf '\n\033[1;32m› %s\033[0m\n' "$*"; }

log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent iptables-persistent >/dev/null

log "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

log "Ollama + $MODEL (local only, never exposed)"
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
systemctl enable --now ollama
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done
ollama pull "$MODEL"

log "Firewall: allow 80/443 (Oracle Ubuntu images block them by default)"
for port in 80 443; do
  iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
done
netfilter-persistent save >/dev/null

log "Caddy (automatic HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
sed "s/__DOMAIN__/$DOMAIN/" "$APP_DIR/deploy/oracle/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

log "App user and environment"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home /opt/nutriflow --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/server-data"
cat > "$APP_DIR/.env" <<EOF
DATABASE_URL="file:$APP_DIR/server-data/nutriflow.db"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="$MODEL"
# Caddy overwrites X-Forwarded-For with the real visitor IP (used for rate limiting).
NUTRIFLOW_CLIENT_IP_HEADER="x-forwarded-for"
EOF
chown -R "$APP_USER:$APP_USER" /opt/nutriflow
chmod 700 "$APP_DIR/server-data"
chmod 600 "$APP_DIR/.env"

log "Install dependencies and build (a few minutes on first run)"
cd "$APP_DIR"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build && npm run server:setup"

log "Service"
cp "$APP_DIR/deploy/oracle/nutriflow.service" /etc/systemd/system/nutriflow.service
systemctl daemon-reload
systemctl enable nutriflow
systemctl restart nutriflow
for _ in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3000/login && break; sleep 1; done
systemctl --no-pager --lines=5 status nutriflow || true

log "Done → https://$DOMAIN"
