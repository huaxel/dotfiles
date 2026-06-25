#!/usr/bin/env python3
"""llama.cpp live stats bridge — multi-server.

Pure-stdlib HTTP service that polls one or more llama.cpp servers and
provides a combined live-stats feed for the pi `llama-stats` extension.

Endpoints on BRIDGE_PORT (default 55268):

    GET /stats   -> JSON snapshot
    GET /stream  -> Server-Sent Events
    GET /health  -> {"status": "ok"}

Servers are configured via LLAMA_SERVERS (comma-separated label=url pairs):

    LLAMA_SERVERS=framearch=http://127.0.0.1:8000,cachy=http://127.0.0.1:9092

For backward compat, LLAMA_SERVER (single url) is accepted as a fallback.

Live generation speed is derived from the derivative of the cumulative
`llamacpp:n_decode_total` counter, giving real-time tok/s during a stream.

No third-party dependencies.
"""

from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import threading
import time
import urllib.request
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, urlparse

# ── Configuration (env-overridable) ──────────────────────────────────────────

# Comma-separated list:  label=http://host:port,label2=http://host2:port2
# Or the older single-server LLAMA_SERVER env var (fallback).
LLAMA_SERVERS_RAW = os.environ.get(
    "LLAMA_SERVERS",
    os.environ.get("LLAMA_SERVER", "http://127.0.0.1:8000"),
)

SERVICE = os.environ.get("LLAMA_SERVICE", "llama.cpp.service")
BRIDGE_HOST = os.environ.get("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "55268"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "1.0"))
HISTORY_LEN = int(os.environ.get("HISTORY_LEN", "120"))
HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "2.0"))
VERSION = "bridge/2.2-multi"


def _parse_servers(raw: str) -> list[tuple[str, str]]:
    """Return [(label, base_url), ...] from a comma-separated string.

    Each entry:  label=http://host:port   or   just http://host:port
    """
    servers: list[tuple[str, str]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if "=" in part:
            label, url = part.split("=", 1)
            servers.append((label.strip(), url.rstrip("/")))
        else:
            url = part.rstrip("/")
            host = url.split("://", 1)[-1].split(":")[0].split("/")[0]
            label = host.replace(".", "_")
            servers.append((label, url))
    return servers


LLAMA_SERVERS = _parse_servers(LLAMA_SERVERS_RAW)


# ── Shared state ─────────────────────────────────────────────────────────────


class _PerServer:
    """Per-server bookkeeping."""

    def __init__(self) -> None:
        self.model: str | None = None
        self.slots: dict[str, dict] = {}
        self.n_ctx: int = 0
        self.max_tokens: int = 0
        self.prev_decode: tuple[float, float] | None = None
        self.decode_baseline: float = 0.0
        self.was_processing: bool = False


class State:
    """Mutable aggregate snapshot guarded by a single lock."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.history: deque[list] = deque(maxlen=HISTORY_LEN)
        self.last_update: float = 0.0
        self._per_server: dict[str, _PerServer] = {}

    def for_server(self, label: str) -> _PerServer:
        if label not in self._per_server:
            self._per_server[label] = _PerServer()
        return self._per_server[label]

    def snapshot(self) -> dict:
        with self.lock:
            merged_slots: dict[str, dict] = {}
            any_processing = False
            max_ctx = 0
            max_tok = 0
            server_models: list[str] = []

            for label, ps in self._per_server.items():
                for sid, sdata in ps.slots.items():
                    merged_slots[f"{label}-{sid}"] = dict(sdata)
                if any(s.get("is_processing") for s in ps.slots.values()):
                    any_processing = True
                if ps.n_ctx > max_ctx:
                    max_ctx = ps.n_ctx
                if ps.max_tokens > max_tok:
                    max_tok = ps.max_tokens
                if ps.model:
                    server_models.append(f"{label}/{ps.model}")

            mem: dict = {}
            ram = _read_ram_mb()
            vram = _read_vram_mb()
            if ram is not None:
                mem["ram_used_mb"] = ram
            if vram is not None:
                mem["vram_used_mb"] = vram

            return {
                "model": ", ".join(server_models) if server_models else None,
                "is_processing": any_processing,
                "last_update": (
                    datetime.fromtimestamp(self.last_update, timezone.utc).isoformat()
                    if self.last_update
                    else None
                ),
                "version": VERSION,
                "unmatched_lines": 0,
                "slots": merged_slots,
                "memory": mem,
                "context": {"n_ctx": max_ctx, "max_tokens": max_tok},
                "history": list(self.history),
            }


STATE = State()


def _slot_for(label: str, sid: str) -> dict:
    """Get-or-create a slot record for a specific server (caller holds lock)."""
    ps = STATE.for_server(label)
    return ps.slots.setdefault(
        sid,
        {
            "state": "idle",
            "is_processing": False,
            "pp_speed": 0.0,
            "pp_progress": 0.0,
            "prompt_tokens": 0,
            "tg_speed": 0.0,
            "n_decoded": 0,
            "last_active": 0.0,
        },
    )


def _now() -> float:
    return time.time()


# ── Memory probes ────────────────────────────────────────────────────────────

_CGROUP_CANDIDATES = [
    f"/sys/fs/cgroup/system.slice/{SERVICE}/memory.current",
]


def _read_int(path: str) -> int | None:
    try:
        with open(path) as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def _read_ram_mb() -> int | None:
    for path in _CGROUP_CANDIDATES:
        val = _read_int(path)
        if val is not None:
            return val // (1024 * 1024)
    try:
        out = subprocess.run(
            ["systemctl", "show", SERVICE, "-p", "MemoryCurrent", "--value"],
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
        return int(out) // (1024 * 1024) if out.isdigit() else None
    except Exception:
        return None


def _read_vram_mb() -> int | None:
    total = 0
    found = False
    for base in glob.glob("/sys/class/drm/card*/device"):
        for name in ("mem_info_vram_used", "mem_info_gtt_used"):
            val = _read_int(os.path.join(base, name))
            if val is not None:
                total += val
                found = True
    return total // (1024 * 1024) if found else None


# ── HTTP helpers ─────────────────────────────────────────────────────────────


def _http_get_json(base_url: str, path: str):
    req = urllib.request.Request(
        base_url + path, headers={"Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.load(resp)


def _http_get_text(base_url: str, path: str) -> str:
    with urllib.request.urlopen(base_url + path, timeout=HTTP_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


_METRIC_LINE = re.compile(r"^(llamacpp:[a-z_]+)\s+([\d.eE+-]+)\s*$")


def _parse_prometheus(text: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for line in text.splitlines():
        if line.startswith("#"):
            continue
        m = _METRIC_LINE.match(line)
        if m:
            try:
                out[m.group(1)] = float(m.group(2))
            except ValueError:
                pass
    return out


_CTX_ARG = re.compile(r"--ctx-size[= ](\d+)")


# ── Pollers ──────────────────────────────────────────────────────────────────


def poll_server(label: str, base_url: str) -> None:
    """Poll one llama.cpp server and update STATE for that label."""
    loaded: str | None = None

    # --- /v1/models ---
    try:
        models = _http_get_json(base_url, "/v1/models")
    except Exception:
        models = None
    if models:
        for m in models.get("data", []):
            status = m.get("status") or {}
            if status.get("value") in ("loaded", "loading", "active"):
                loaded = m.get("id")
                argline = " ".join(str(a) for a in (status.get("args") or []))
                match = _CTX_ARG.search(argline)
                with STATE.lock:
                    ps = STATE.for_server(label)
                    ps.model = loaded
                    if match:
                        ps.n_ctx = int(match.group(1))
                break
        if loaded is None:
            with STATE.lock:
                STATE.for_server(label).model = None

    if not loaded:
        return

    # --- /slots ---
    try:
        slots = _http_get_json(base_url, f"/slots?model={quote(loaded)}")
    except Exception:
        slots = None
    if isinstance(slots, list):
        with STATE.lock:
            ps = STATE.for_server(label)
            for s in slots:
                sid = str(s.get("id", 0))
                rec = _slot_for(label, sid)
                processing = bool(s.get("is_processing"))
                rec["is_processing"] = processing
                if s.get("n_ctx"):
                    ps.n_ctx = int(s["n_ctx"])
                params = s.get("params") or {}
                n_predict = params.get("n_predict") or params.get("max_tokens")
                if isinstance(n_predict, int) and n_predict > 0:
                    ps.max_tokens = n_predict
                total_pt = s.get("n_prompt_tokens") or 0
                done_pt = s.get("n_prompt_tokens_processed") or 0
                if processing:
                    rec["prompt_tokens"] = total_pt
                    rec["pp_progress"] = min(1.0, done_pt / total_pt) if total_pt else 0.0
                    rec["last_active"] = _now()

    # --- /metrics ---
    try:
        metrics_text = _http_get_text(base_url, f"/metrics?model={quote(loaded)}")
        metrics = _parse_prometheus(metrics_text)
    except Exception:
        metrics = {}

    if not metrics:
        return

    decode_total = metrics.get("llamacpp:n_decode_total", 0.0)
    processing = metrics.get("llamacpp:requests_processing", 0.0) > 0
    pp_gauge = metrics.get("llamacpp:prompt_tokens_seconds", 0.0)
    tg_gauge = metrics.get("llamacpp:predicted_tokens_seconds", 0.0)
    t = _now()

    with STATE.lock:
        ps = STATE.for_server(label)
        rate = 0.0
        if ps.prev_decode is not None:
            prev_count, prev_t = ps.prev_decode
            dt = t - prev_t
            if dt > 0 and decode_total >= prev_count:
                rate = (decode_total - prev_count) / dt
        ps.prev_decode = (decode_total, t)

        rec = _slot_for(label, "0")
        if processing and not ps.was_processing:
            ps.decode_baseline = decode_total
            rec.update(n_decoded=0, tg_speed=0.0, pp_progress=0.0, state="prompt")
        ps.was_processing = processing

        rec["is_processing"] = processing
        if processing:
            rec["tg_speed"] = round(rate if rate > 0 else tg_gauge, 2)
            rec["pp_speed"] = round(pp_gauge, 2)
            rec["n_decoded"] = max(0, int(decode_total - ps.decode_baseline))
            if rec["n_decoded"] > 0 or rate > 0:
                rec["state"] = "generating"
                rec["pp_progress"] = 1.0
            else:
                rec["state"] = "prompt"
            rec["last_active"] = t
            STATE.history.append([t, rec["pp_speed"], rec["tg_speed"]])
        elif rec["state"] not in ("idle", "done"):
            rec["state"] = "done"


def poll_loop() -> None:
    while True:
        try:
            for label, base_url in LLAMA_SERVERS:
                poll_server(label, base_url)

            with STATE.lock:
                STATE.last_update = _now()
                any_active = any(
                    any(s.get("is_processing") for s in ps.slots.values())
                    for ps in STATE._per_server.values()
                )
                if not any_active:
                    for ps in STATE._per_server.values():
                        ps.prev_decode = None
                    STATE.history.append([_now(), 0.0, 0.0])
        except Exception:
            pass
        time.sleep(POLL_INTERVAL)


# ── HTTP server ──────────────────────────────────────────────────────────────


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args) -> None:
        pass

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json({"status": "ok"})
        elif path == "/stats":
            self._send_json(STATE.snapshot())
        elif path == "/stream":
            self._stream()
        else:
            self.send_error(404)

    def _send_json(self, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _stream(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._cors()
        self.end_headers()
        try:
            while True:
                payload = json.dumps(STATE.snapshot())
                self.wfile.write(f"data: {payload}\n\n".encode())
                self.wfile.flush()
                time.sleep(POLL_INTERVAL)
        except (BrokenPipeError, ConnectionResetError):
            return


def main() -> None:
    threading.Thread(target=poll_loop, daemon=True).start()
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), Handler)
    targets = ", ".join(f"{l}={u}" for l, u in LLAMA_SERVERS)
    print(f"{VERSION} listening on http://{BRIDGE_HOST}:{BRIDGE_PORT}  -> {targets}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
