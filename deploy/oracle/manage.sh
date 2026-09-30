#!/usr/bin/env bash
# Manage the NutriFlow server on the Oracle Cloud VM from this PC (over SSH).
#
#   bash deploy/oracle/manage.sh <public-ip> <command>
#
#   status     service health (NutriFlow, Caddy, Ollama) and disk usage
#   logs       follow the NutriFlow server log (Ctrl+C to stop)
#   restart    restart the NutriFlow service
#   dietitian  --name "Full Name" --email someone@example.com [--password "…"]
#              create a dietitian login (prints a generated password), or reset
#              an existing dietitian's password and sign them out everywhere
#   list       list dietitians and their patient counts
#   backup     download a consistent copy of the live database to ./backups/
set -euo pipefail

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 1; }
[ $# -ge 2 ] || usage
IP="$1"; CMD="$2"; shift 2

KEY="${NUTRIFLOW_SSH_KEY:-$HOME/.ssh/nutriflow_oracle}"
SSH_USER="${NUTRIFLOW_SSH_USER:-ubuntu}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SSH_USER@$IP")

# Run an owner command (scripts/server.ts) on the server as the app user.
# Arguments are %q-quoted once, for the remote shell, so names like O'Neil survive.
server_cmd() {
  local script="$1"; shift
  local args=""
  [ $# -gt 0 ] && args="-- $(printf '%q ' "$@")"
  "${SSH[@]}" "cd /opt/nutriflow/app && sudo -u nutriflow -H npm run -s $script $args"
}

case "$CMD" in
  status)
    "${SSH[@]}" "systemctl is-active nutriflow caddy ollama | paste -d' ' <(printf 'nutriflow\ncaddy\nollama\n') -; \
      echo; df -h /opt/nutriflow | tail -1 | awk '{print \"disk: \" \$3 \" used of \" \$2 \" (\" \$5 \")\"}'; \
      curl -s -o /dev/null -w 'app: HTTP %{http_code}\n' http://127.0.0.1:3000/login"
    ;;
  logs)
    "${SSH[@]}" -t "sudo journalctl -u nutriflow -n 100 -f"
    ;;
  restart)
    "${SSH[@]}" "sudo systemctl restart nutriflow && sleep 3 && systemctl is-active nutriflow"
    ;;
  dietitian)
    server_cmd server:dietitian "$@"
    ;;
  list)
    server_cmd server:list
    ;;
  backup)
    # VACUUM INTO writes a consistent snapshot even while the server is running,
    # unlike copying the .db file mid-write.
    ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
    OUT="$ROOT/backups/nutriflow-$(date +%Y%m%d-%H%M%S).db"
    mkdir -p "$ROOT/backups"
    SNAP=/opt/nutriflow/backup-snapshot.db
    "${SSH[@]}" "cd /opt/nutriflow/app && sudo -u nutriflow rm -f $SNAP && sudo -u nutriflow node -e \"
      require('@libsql/client').createClient({ url: 'file:/opt/nutriflow/app/server-data/nutriflow.db' })
        .execute(\\\"VACUUM INTO '$SNAP'\\\").then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });\""
    "${SSH[@]}" "sudo cat $SNAP && sudo rm -f $SNAP" > "$OUT"
    echo "✓ Backup saved: $OUT ($(du -h "$OUT" | cut -f1))"
    echo "  It contains patient data — keep it somewhere private."
    ;;
  *)
    usage
    ;;
esac
