#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Throwaway dev containers on home servers ("cheap cloud").
#
# Spins up disposable containers on a home server, exposed
# tailnet-only (bound to the server's Tailscale IP) on a
# free port from the sandbox range (31000-31999), away from
# deploy ports (8080/8081), uptime-kuma (3001), and
# nursultan (30080/8787).
#
# Usage:
#   sandbox.sh <server> up <image> [name]
#   sandbox.sh <server> list
#   sandbox.sh <server> logs <name>
#   sandbox.sh <server> ports
#   sandbox.sh <server> down <name>
#
# Examples:
#   just sandbox acerpepe up postgres:16-alpine
#   just sandbox acerpepe up redis:7-alpine myredis
#   just sandbox acerpepe logs myredis
#   just sandbox acerpepe down myredis
# ─────────────────────────────────────────────────────────

set -euo pipefail

SERVER="${1:?usage: sandbox.sh <server> <up|list|logs|ports|down> [image] [name]}"
ACTION="${2:?usage: sandbox.sh <server> <up|list|logs|ports|down> [image] [name]}"
ARG="${3:-}"

PORT_MIN=31000
PORT_MAX=31999

echo "🌐 sandbox → $SERVER ($ACTION)"

case "$ACTION" in
  up)
    [ -n "$ARG" ] || { echo "  ❌ 'up' needs an image (e.g. postgres:16-alpine)"; exit 1; }
    IMAGE="$ARG"
    NAME="${4:-}"
    ;;
  logs|down)
    [ -n "$ARG" ] || { echo "  ❌ '$ACTION' needs a container name"; exit 1; }
    NAME="$ARG"
    ;;
  list|ports) ;;
  *) echo "  usage: sandbox.sh <server> <up|list|logs|ports|down> ..."; exit 1 ;;
esac

case "$ACTION" in
  up)
    # Tailscale IP for binding → tailnet-only exposure
    TS_IP=$(ssh "$SERVER" 'tailscale ip -4 2>/dev/null | head -1')
    [ -n "$TS_IP" ] || { echo "  ❌ no Tailscale IPv4 on $SERVER"; exit 1; }

    # First free port in the sandbox range
    # shellcheck disable=SC2029
    PORT=$(ssh "$SERVER" "seq $PORT_MIN $PORT_MAX | while read -r p; do
        ss -tln 2>/dev/null | grep -qE \":\$p( |\$)\" || { echo \"\$p\"; break; }
      done")
    [ -n "$PORT" ] && [ "$PORT" -le "$PORT_MAX" ] 2>/dev/null || { echo "  ❌ no free port in $PORT_MIN-$PORT_MAX"; exit 1; }

    # Default name: sb-<image-slug>-<timestamp-tail>
    if [ -z "$NAME" ]; then
      slug=$(basename "$IMAGE" | tr ':.' '-')
      NAME="sb-${slug}-$(date +%s | tail -c 5)"
    fi

    echo "  image : $IMAGE"
    echo "  name  : $NAME"
    echo "  port  : $PORT → http://$TS_IP:$PORT (tailnet only)"
    # shellcheck disable=SC2029
    ssh "$SERVER" "docker run -d --name '$NAME' --label sandbox=1 -p '$TS_IP:$PORT:$PORT' '$IMAGE'"
    echo "  ✅ $NAME is up → http://$TS_IP:$PORT"
    echo "  logs  : just sandbox $SERVER logs $NAME"
    echo "  teardown: just sandbox $SERVER down $NAME"
    ;;

  list)
    ssh "$SERVER" 'docker ps --filter label=sandbox=1 --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"'
    ;;

  logs)
    # shellcheck disable=SC2029
    ssh "$SERVER" "docker logs --tail 50 '$NAME'"
    ;;

  ports)
    # shellcheck disable=SC2029
    ssh "$SERVER" "ss -tln | awk '{split(\$4,a,\":\"); p=a[length(a)]; if (p ~ /^[0-9]+\$/ && p+0 >= $PORT_MIN && p+0 <= $PORT_MAX) print p}' | sort -n | uniq | tr '\n' ' '; echo"
    ;;

  down)
    # shellcheck disable=SC2029
    ssh "$SERVER" "docker rm -f '$NAME' 2>/dev/null && echo '  ✅ removed $NAME' || echo '  no container named $NAME'"
    ;;
esac
