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
#   sandbox.sh <server> up <image> [name] [container-port]
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

SERVER="${1:?usage: sandbox.sh <server> <up|list|logs|ports|down> [image] [name] [container-port]}"
ACTION="${2:?usage: sandbox.sh <server> <up|list|logs|ports|down> [image] [name] [container-port]}"
ARG="${3:-}"

case "$SERVER" in
  -*|*[!a-zA-Z0-9_.@-]*) echo "  ❌ invalid server name" >&2; exit 2 ;;
esac

PORT_MIN=31000
PORT_MAX=31999

echo "🌐 sandbox → $SERVER ($ACTION)"

case "$ACTION" in
  up)
    [ -n "$ARG" ] || { echo "  ❌ 'up' needs an image (e.g. postgres:16-alpine)"; exit 1; }
    IMAGE="$ARG"
    NAME="${4:-}"
    CONTAINER_PORT="${5:-}"
    case "$IMAGE" in
      -*|*[!a-zA-Z0-9_./:@-]*) echo "  ❌ invalid image reference" >&2; exit 2 ;;
    esac
    if [ -n "$NAME" ]; then
      case "$NAME" in -*|*[!a-zA-Z0-9_.-]*) echo "  ❌ invalid container name" >&2; exit 2 ;; esac
    fi
    if [ -n "$CONTAINER_PORT" ]; then
      case "$CONTAINER_PORT" in *[!0-9]*|'') echo "  ❌ container port must be numeric" >&2; exit 2 ;; esac
    fi
    ;;
  logs|down)
    [ -n "$ARG" ] || { echo "  ❌ '$ACTION' needs a container name"; exit 1; }
    NAME="$ARG"
    case "$NAME" in -*|*[!a-zA-Z0-9_.-]*) echo "  ❌ invalid container name" >&2; exit 2 ;; esac
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
      slug=$(basename "$IMAGE" | tr -cs 'a-zA-Z0-9_.-' '-' | sed 's/^-//;s/-$//')
      NAME="sb-${slug}-$(date +%s | tail -c 5)"
    fi

    # Pull first and infer a single declared container port when none was given.
    # Images with zero or several exposed ports require an explicit value.
    if [ -z "$CONTAINER_PORT" ]; then
      CONTAINER_PORT=$(ssh "$SERVER" bash -s -- "$IMAGE" <<'REMOTE'
set -euo pipefail
image="$1"
docker pull "$image" >/dev/null
mapfile -t ports < <(docker image inspect --format '{{range $port, $_ := .Config.ExposedPorts}}{{$port}}{{"\n"}}{{end}}' "$image" | sed 's#/.*##' | sort -u)
[ "${#ports[@]}" -eq 1 ] || { echo "image exposes ${#ports[@]} ports; specify container-port" >&2; exit 2; }
echo "${ports[0]}"
REMOTE
      )
    fi

    echo "  image : $IMAGE"
    echo "  name  : $NAME"
    echo "  port  : $PORT → container $CONTAINER_PORT → http://$TS_IP:$PORT (tailnet only)"
    ssh "$SERVER" bash -s -- "$NAME" "$TS_IP" "$PORT" "$CONTAINER_PORT" "$IMAGE" <<'REMOTE'
set -euo pipefail
docker run -d --name "$1" --label sandbox=1 -p "$2:$3:$4" "$5"
REMOTE
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
