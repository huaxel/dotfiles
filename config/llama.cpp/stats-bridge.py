#!/usr/bin/env python3
"""llama.cpp live stats bridge.

Pure-stdlib HTTP service that turns a running llama.cpp router (llama-server)
into a compact live-stats feed for the pi `llama-stats` extension.

It serves three endpoints on BRIDGE_PORT (default 55268):

    GET /stats   -> a JSON snapshot (the LlamaStats schema below)
    GET /stream  -> the same snapshot pushed as Server-Sent Events
    GET /health  -> {"status": "ok"}

Data sources (all best-effort; any one failing never crashes the loop):

    * journalctl -u llama.cpp.service   -> live per-slot timing (tok/s, decoded)
    * GET /v1/models                    -> currently loaded model + ctx size
    * GET /slots?model=<loaded>         -> live slot processing state
    * /sys/.../mem_info_{gtt,vram}_used -> GPU memory footprint (Strix Halo: GTT)
    * cgroup memory.current             -> resident RAM of the service

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
VERSION = "bridge/2.0-stdlib"

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
        self.model_size_mb: int = 0
        self.offloaded_layers: int | None = None
        self.total_layers: int | None = None
        self.history: deque[list] = deque(maxlen=HISTORY_LEN)
        self.unmatched_lines: int = 0
        self.last_update: float = 0.0

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
            elif self.model_size_mb:
                mem["vram_used_mb"] = self.model_size_mb
            if self.offloaded_layers is not None:
                mem["offloaded_layers"] = self.offloaded_layers
            if self.total_layers is not None:
                mem["total_layers"] = self.total_layers
            return {
                "model": self.model,
                "is_processing": any_processing,
                "last_update": (
                    datetime.fromtimestamp(self.last_update, timezone.utc).isoformat()
                    if self.last_update
                    else None
                ),
                "version": self.build or VERSION,
                "unmatched_lines": self.unmatched_lines,
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
    import glob

    for base in glob.glob("/sys/class/drm/card*/device"):
        for name in ("mem_info_vram_used", "mem_info_gtt_used"):
            val = _read_int(os.path.join(base, name))
            if val is not None:
                total += val
                found = True
    return total // (1024 * 1024) if found else None


# ── HTTP polling of the llama-server router ──────────────────────────────────


def http_get_json(path: str):
    url = LLAMA_SERVER + path
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.load(resp)


_CTX_ARG = re.compile(r"--ctx-size[= ](\d+)")


def poll_http() -> None:
    """Refresh model / ctx / live slot state from the router HTTP API."""
    loaded_model = None
    try:
        models = http_get_json("/v1/models")
        for m in models.get("data", []):
            status = (m.get("status") or {}).get("value")
            if status in ("loaded", "loading", "active"):
                loaded_model = m.get("id")
                args = (m.get("status") or {}).get("args") or []
                argline = " ".join(str(a) for a in args)
                match = _CTX_ARG.search(argline)
                with STATE.lock:
                    STATE.model = loaded_model
                    if match:
                        STATE.n_ctx = int(match.group(1))
                break
        else:
            # Nothing loaded -> router is idle.
            with STATE.lock:
                STATE.model = None
    except Exception:
        pass

    if not loaded_model:
        return

    try:
        slots = http_get_json(f"/slots?model={quote(loaded_model)}")
        if isinstance(slots, list):
            with STATE.lock:
                for s in slots:
                    sid = str(s.get("id", 0))
                    rec = slot(sid)
                    processing = bool(s.get("is_processing"))
                    rec["is_processing"] = processing
                    n_ctx = s.get("n_ctx")
                    if n_ctx:
                        STATE.n_ctx = int(n_ctx)
                    params = s.get("params") or {}
                    n_predict = params.get("n_predict") or params.get("max_tokens")
                    if isinstance(n_predict, int) and n_predict > 0:
                        STATE.max_tokens = n_predict
                    total_pt = s.get("n_prompt_tokens") or 0
                    done_pt = s.get("n_prompt_tokens_processed") or 0
                    if processing:
                        rec["prompt_tokens"] = total_pt
                        rec["pp_progress"] = (
                            min(1.0, done_pt / total_pt) if total_pt else 0.0
                        )
                        rec["last_active"] = now()
                        if rec["pp_progress"] < 1.0 and rec["pp_progress"] > 0:
                            rec["state"] = "prompt"
                        elif rec["state"] in ("idle", "done"):
                            rec["state"] = "generating"
                    elif rec["state"] not in ("idle", "done"):
                        rec["state"] = "done"
    except Exception:
        pass


# ── Journal tailing for per-request timing ───────────────────────────────────

_RE_LAUNCH = re.compile(r"slot\s+launch_slot_:\s+id\s+(\d+)")
_RE_RELEASE = re.compile(r"slot\s+release:\s+id\s+(\d+)")
_RE_PP = re.compile(
    r"slot\s+print_timing:\s+id\s+(\d+).*?prompt eval time\s*=\s*[\d.]+\s*ms\s*/\s*"
    r"(\d+)\s*tokens.*?([\d.]+)\s*tokens per second"
)
_RE_TG = re.compile(
    r"slot\s+print_timing:\s+id\s+(\d+).*?\|\s+eval time\s*=\s*[\d.]+\s*ms\s*/\s*"
    r"(\d+)\s*tokens.*?([\d.]+)\s*tokens per second"
)
_RE_PROGRESS = re.compile(
    r"slot\s+update_slots:\s+id\s+(\d+).*?progress\s*=\s*([\d.]+)"
)
_RE_NEWSLOT = re.compile(r"slot\s+load_model:\s+id\s+(\d+).*?n_ctx\s*=\s*(\d+)")
_RE_IDLE = re.compile(r"all slots are idle")
_RE_CHILD_INFO = re.compile(r"cmd_child_to_router:info:(\{.*\})")


def handle_log_line(line: str) -> None:
    with STATE.lock:
        m = _RE_LAUNCH.search(line)
        if m:
            rec = slot(m.group(1))
            rec.update(
                is_processing=True,
                state="prompt",
                pp_progress=0.0,
                pp_speed=0.0,
                tg_speed=0.0,
                n_decoded=0,
                last_active=now(),
            )
            return

        m = _RE_PP.search(line)
        if m:
            rec = slot(m.group(1))
            rec["prompt_tokens"] = int(m.group(2))
            rec["pp_speed"] = float(m.group(3))
            rec["pp_progress"] = 1.0
            rec["state"] = "generating"
            rec["last_active"] = now()
            return

        m = _RE_TG.search(line)
        if m and "prompt eval time" not in line:
            rec = slot(m.group(1))
            rec["n_decoded"] = int(m.group(2))
            rec["tg_speed"] = float(m.group(3))
            rec["state"] = "generating"
            rec["last_active"] = now()
            STATE.history.append(
                [now(), rec.get("pp_speed", 0.0), rec.get("tg_speed", 0.0)]
            )
            return

        m = _RE_PROGRESS.search(line)
        if m:
            rec = slot(m.group(1))
            rec["pp_progress"] = float(m.group(2))
            rec["state"] = "prompt"
            rec["is_processing"] = True
            rec["last_active"] = now()
            return

        m = _RE_RELEASE.search(line)
        if m:
            rec = slot(m.group(1))
            rec["is_processing"] = False
            rec["state"] = "done"
            return

        m = _RE_NEWSLOT.search(line)
        if m:
            STATE.n_ctx = int(m.group(2))
            return

        m = _RE_CHILD_INFO.search(line)
        if m:
            try:
                info = json.loads(m.group(1))
                STATE.model = info.get("id") or STATE.model
                meta = info.get("meta") or {}
                if meta.get("n_ctx"):
                    STATE.n_ctx = int(meta["n_ctx"])
                if meta.get("size"):
                    STATE.model_size_mb = int(meta["size"]) // (1024 * 1024)
            except (ValueError, TypeError):
                STATE.unmatched_lines += 1
            return

        if _RE_IDLE.search(line):
            for rec in STATE.slots.values():
                rec["is_processing"] = False
                if rec["state"] != "idle":
                    rec["state"] = "done"
            return

        # Lines that look like slot telemetry but matched no pattern.
        if "print_timing" in line or "update_slots" in line:
            STATE.unmatched_lines += 1


def journal_tail() -> None:
    """Follow the service journal forever, restarting on any hiccup."""
    cmd = [
        "journalctl",
        "-u",
        SERVICE,
        "-f",
        "-o",
        "cat",
        "-n",
        "0",
        "--no-hostname",
    ]
    while True:
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                try:
                    handle_log_line(line)
                except Exception:
                    pass
        except Exception:
            pass
        time.sleep(2)  # journalctl died/unavailable — back off and retry.


def poll_loop() -> None:
    while True:
        try:
            poll_http()
            with STATE.lock:
                STATE.last_update = now()
                # Keep the sparkline alive while idle so it decays visibly.
                if not any(s.get("is_processing") for s in STATE.slots.values()):
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
    threading.Thread(target=journal_tail, daemon=True).start()
    threading.Thread(target=poll_loop, daemon=True).start()
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), Handler)
    print(f"{VERSION} listening on http://{BRIDGE_HOST}:{BRIDGE_PORT}  -> {LLAMA_SERVER}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
