#!/usr/bin/env bash
# Deploy NutriFlow AI from this PC to the Oracle Cloud VM.
#
#   bash deploy/oracle/deploy.sh <public-ip> [--copy-data] [--domain name]
#
#   --copy-data   upload server-data/nutriflow.db (existing dietitian accounts).
#                 Only used when the server has no database yet — never overwrites live data.
#   --domain      custom domain; defaults to <ip-with-dashes>.sslip.io (free, no setup)
#
# Re-run any time to ship code changes; the server's data is kept.
set -euo pipefail

IP="${1:?usage: deploy.sh <public-ip> [--copy-data] [--domain name]}"
shift
COPY_DATA=0
DOMAIN="${IP//./-}.sslip.io"
while [ $# -gt 0 ]; do
  case "$1" in
    --copy-data) COPY_DATA=1 ;;
    --domain) DOMAIN="$2"; shift ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
  shift
done

KEY="${NUTRIFLOW_SSH_KEY:-$HOME/.ssh/nutriflow_oracle}"
SSH_USER="${NUTRIFLOW_SSH_USER:-ubuntu}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SSH_USER@$IP")
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "› Deploying to $SSH_USER@$IP  →  https://$DOMAIN"
"${SSH[@]}" true

echo "› Uploading app (no local data, secrets, or build outputs)"
tar -C "$ROOT" -czf - \
  --exclude=./node_modules --exclude=./.next --exclude=./.git \
  --exclude=./src/generated --exclude=./server-data --exclude=./tools \
  --exclude=./desktop --exclude=./download \
  --exclude='./.env' --exclude='./.env.*' --exclude='*.db' --exclude='*.db-journal' \
  . | "${SSH[@]}" "sudo mkdir -p /opt/nutriflow/app && sudo tar -xzf - -C /opt/nutriflow/app"

if [ "$COPY_DATA" = 1 ]; then
  if "${SSH[@]}" "sudo test -f /opt/nutriflow/app/server-data/nutriflow.db"; then
    echo "› Server already has a database — not overwriting it"
  else
    echo "› Uploading server-data/nutriflow.db"
    "${SSH[@]}" "sudo mkdir -p /opt/nutriflow/app/server-data"
    "${SSH[@]}" "sudo tee /opt/nutriflow/app/server-data/nutriflow.db >/dev/null" < "$ROOT/server-data/nutriflow.db"
  fi
fi

echo "› Running setup on the server"
"${SSH[@]}" "sudo bash /opt/nutriflow/app/deploy/oracle/setup.sh '$DOMAIN'"

echo "› Checking https://$DOMAIN (the first certificate can take a minute)"
for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "https://$DOMAIN/login" || true)
  [ "$code" = 200 ] && break
  sleep 5
done
if [ "$code" != 200 ]; then
  echo "✗ https://$DOMAIN isn't answering yet (last status: ${code:-none})."
  echo "  Check that the VM's security list allows TCP 80 and 443, then:"
  echo "  bash deploy/oracle/manage.sh $IP status"
  exit 1
fi

cat <<EOF

✓ NutriFlow AI is live at https://$DOMAIN

Next steps:
  • Create a dietitian login:
      bash deploy/oracle/manage.sh $IP dietitian --name "Full Name" --email someone@example.com
  • Build the desktop app for this server:
      cd desktop && npm install && npm run dist -- --server https://$DOMAIN
EOF
