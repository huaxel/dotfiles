#!/usr/bin/env python3
"""llama.cpp live stats bridge.

Pure-stdlib HTTP service that turns a running llama.cpp router (llama-server)
into a compact live-stats feed for the pi `llama-stats` extension.

It serves three endpoints on BRIDGE_PORT (default 55268):

    GET /stats   -> a JSON snapshot (the LlamaStats schema below)
    GET /stream  -> the same snapshot pushed as Server-Sent Events
    GET /health  -> {"status": "ok"}

Data sources (HTTP-only; each is best-effort and never crashes the loop):

    * GET /v1/models                    -> currently loaded model + ctx size
    * GET /slots?model=<loaded>         -> per-slot processing / prompt progress
    * GET /metrics?model=<loaded>       -> live tok/s (requires the server to be
                                           started with --metrics /
                                           LLAMA_ARG_ENDPOINT_METRICS=1)
    * /sys/.../mem_info_{gtt,vram}_used -> GPU memory footprint (Strix Halo: GTT)
    * cgroup memory.current             -> resident RAM of the service

Live generation speed is derived from the *derivative* of the cumulative
`llamacpp:n_decode_total` counter, which advances every decode step — so tok/s
is reported in real time during a stream, not just at completion. The
`predicted_tokens_seconds` / `prompt_tokens_seconds` gauges (which only settle
at request end) are used as fall-backs.

No third-party dependencies on purpose: the previous incarnation was OOM-killed
under memory pressure, so this one stays tiny and has zero import-time cost.

The emitted schema (consumed by pi_extensions/llama-stats.ts):

    LlamaStats = {
      model, is_processing, last_update, version, unmatched_lines,
      slots:   { "<id>": LlamaSlot, ... },
      memory:  { ram_used_mb, vram_used_mb, total_layers?, offloaded_layers? },
      context: { n_ctx, max_tokens },
      history: [ [epoch_s, pp_speed, tg_speed], ... ],
    }
    LlamaSlot = {
      state, is_processing, pp_speed, pp_progress, prompt_tokens,
      tg_speed, n_decoded, last_active,
    }
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

LLAMA_SERVER = os.environ.get("LLAMA_SERVER", "http://127.0.0.1:8000").rstrip("/")
SERVICE = os.environ.get("LLAMA_SERVICE", "llama.cpp.service")
BRIDGE_HOST = os.environ.get("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "55268"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "1.0"))
HISTORY_LEN = int(os.environ.get("HISTORY_LEN", "120"))
HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "2.0"))
VERSION = "bridge/2.1-metrics"

# ── Shared state ─────────────────────────────────────────────────────────────


class State:
    """Mutable snapshot guarded by a single lock."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.model: str | None = None
        self.build: str | None = None
        self.slots: dict[str, dict] = {}
        self.n_ctx: int = 0
        self.max_tokens: int = 0
        self.history: deque[list] = deque(maxlen=HISTORY_LEN)
        self.last_update: float = 0.0
        # Counter bookkeeping for deriving live generation speed.
        self.prev_decode: tuple[float, float] | None = None  # (count, ts)
        self.decode_baseline: float = 0.0  # n_decode_total at current req start
        self.was_processing: bool = False

    def snapshot(self) -> dict:
        with self.lock:
            slots = {k: dict(v) for k, v in self.slots.items()}
            any_processing = any(s.get("is_processing") for s in slots.values())
            mem: dict = {}
            ram = read_ram_mb()
            vram = read_vram_mb()
            if ram is not None:
                mem["ram_used_mb"] = ram
            if vram is not None:
                mem["vram_used_mb"] = vram
            return {
                "model": self.model,
                "is_processing": any_processing,
                "last_update": (
                    datetime.fromtimestamp(self.last_update, timezone.utc).isoformat()
                    if self.last_update
                    else None
                ),
                "version": self.build or VERSION,
                "unmatched_lines": 0,
                "slots": slots,
                "memory": mem,
                "context": {"n_ctx": self.n_ctx, "max_tokens": self.max_tokens},
                "history": list(self.history),
            }


STATE = State()


def now() -> float:
    return time.time()


def slot(sid: str) -> dict:
    """Get-or-create a slot record (caller must hold the lock)."""
    return STATE.slots.setdefault(
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


# ── Memory probes ────────────────────────────────────────────────────────────

_CGROUP_CANDIDATES = [
    f"/sys/fs/cgroup/system.slice/{SERVICE}/memory.current",
    f"/sys/fs/cgroup/user.slice/{SERVICE}/memory.current",
]


def _read_int(path: str) -> int | None:
    try:
        with open(path) as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def read_ram_mb() -> int | None:
    for path in _CGROUP_CANDIDATES:
        val = _read_int(path)
        if val is not None:
            return val // (1024 * 1024)
    # Fallback: ask systemd directly (spawns, but only if cgroup unreadable).
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


def read_vram_mb() -> int | None:
    """GPU memory footprint. On Strix Halo the model lives in GTT (unified
    memory), not the tiny dedicated VRAM carveout, so sum both."""
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


def http_get_json(path: str):
    req = urllib.request.Request(
        LLAMA_SERVER + path, headers={"Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.load(resp)


def http_get_text(path: str) -> str:
    with urllib.request.urlopen(LLAMA_SERVER + path, timeout=HTTP_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


_METRIC_LINE = re.compile(r"^(llamacpp:[a-z_]+)\s+([\d.eE+-]+)\s*$")


def parse_prometheus(text: str) -> dict[str, float]:
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


def poll_models() -> str | None:
    """Return the currently loaded model id, updating model/ctx state."""
    try:
        models = http_get_json("/v1/models")
    except Exception:
        return None
    loaded = None
    for m in models.get("data", []):
        status = m.get("status") or {}
        if status.get("value") in ("loaded", "loading", "active"):
            loaded = m.get("id")
            argline = " ".join(str(a) for a in (status.get("args") or []))
            match = _CTX_ARG.search(argline)
            with STATE.lock:
                STATE.model = loaded
                if match:
                    STATE.n_ctx = int(match.group(1))
            break
    if loaded is None:
        with STATE.lock:
            STATE.model = None
    return loaded


def poll_slots(model: str) -> None:
    """Per-slot prompt progress / token counts (the prompt phase)."""
    try:
        slots = http_get_json(f"/slots?model={quote(model)}")
    except Exception:
        return
    if not isinstance(slots, list):
        return
    with STATE.lock:
        for s in slots:
            rec = slot(str(s.get("id", 0)))
            processing = bool(s.get("is_processing"))
            rec["is_processing"] = processing
            if s.get("n_ctx"):
                STATE.n_ctx = int(s["n_ctx"])
            params = s.get("params") or {}
            n_predict = params.get("n_predict") or params.get("max_tokens")
            if isinstance(n_predict, int) and n_predict > 0:
                STATE.max_tokens = n_predict
            total_pt = s.get("n_prompt_tokens") or 0
            done_pt = s.get("n_prompt_tokens_processed") or 0
            if processing:
                rec["prompt_tokens"] = total_pt
                rec["pp_progress"] = min(1.0, done_pt / total_pt) if total_pt else 0.0
                rec["last_active"] = now()
            # NB: phase (state) is owned by poll_metrics — it runs after this and
            # knows whether tokens are actually being decoded, which /slots can
            # misreport during context-checkpoint reuse.


def poll_metrics(model: str) -> None:
    """Live generation speed from the Prometheus metrics endpoint.

    tok/s is the derivative of the cumulative `n_decode_total` counter, which
    advances per decode step — giving a true real-time rate during a stream.
    """
    try:
        metrics = parse_prometheus(http_get_text(f"/metrics?model={quote(model)}"))
    except Exception:
        return  # metrics disabled or instance not up — leave slots as-is.
    if not metrics:
        return

    decode_total = metrics.get("llamacpp:n_decode_total", 0.0)
    processing = metrics.get("llamacpp:requests_processing", 0.0) > 0
    pp_gauge = metrics.get("llamacpp:prompt_tokens_seconds", 0.0)
    tg_gauge = metrics.get("llamacpp:predicted_tokens_seconds", 0.0)
    t = now()

    with STATE.lock:
        rate = 0.0
        if STATE.prev_decode is not None:
            prev_count, prev_t = STATE.prev_decode
            dt = t - prev_t
            if dt > 0 and decode_total >= prev_count:
                rate = (decode_total - prev_count) / dt
        STATE.prev_decode = (decode_total, t)

        rec = slot("0")
        # Detect a fresh request and reset this request's per-stream counters.
        if processing and not STATE.was_processing:
            STATE.decode_baseline = decode_total
            rec.update(n_decoded=0, tg_speed=0.0, pp_progress=0.0, state="prompt")
        STATE.was_processing = processing

        rec["is_processing"] = processing
        if processing:
            # Prefer the live derivative; fall back to the (lagging) gauge.
            rec["tg_speed"] = round(rate if rate > 0 else tg_gauge, 2)
            rec["pp_speed"] = round(pp_gauge, 2)
            rec["n_decoded"] = max(0, int(decode_total - STATE.decode_baseline))
            # Once any token is decoded we're generating; until then it's the
            # prompt phase (so the widget shows the PP progress bar, not TG).
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
            model = poll_models()
            if model:
                poll_slots(model)
                poll_metrics(model)
            with STATE.lock:
                STATE.last_update = now()
                # Keep the sparkline decaying visibly while idle.
                if not any(s.get("is_processing") for s in STATE.slots.values()):
                    STATE.prev_decode = None  # reset rate window between streams
                    STATE.history.append([now(), 0.0, 0.0])
        except Exception:
            pass
        time.sleep(POLL_INTERVAL)


# ── HTTP server ──────────────────────────────────────────────────────────────


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args) -> None:  # silence default stderr logging
        pass

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
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
    print(f"{VERSION} listening on http://{BRIDGE_HOST}:{BRIDGE_PORT}  -> {LLAMA_SERVER}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
