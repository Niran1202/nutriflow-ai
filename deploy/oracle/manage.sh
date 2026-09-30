#!/usr/bin/env bash
# Manage the NutriFlow server on the Oracle Cloud VM from this PC (over SSH).
#
#   bash deploy/oracle/manage.sh <public-ip> <command>
#
#   status     service health (NutriFlow, Caddy, Ollama) and disk usage
#   logs       follow the NutriFlow server log (Ctrl+C to stop)
#   restart    restart the NutriFlow service
set -euo pipefail

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 2 ] || usage
IP="$1"; CMD="$2"; shift 2

KEY="${NUTRIFLOW_SSH_KEY:-$HOME/.ssh/nutriflow_oracle}"
SSH_USER="${NUTRIFLOW_SSH_USER:-ubuntu}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$SSH_USER@$IP")

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
  *)
    usage
    ;;
esac
