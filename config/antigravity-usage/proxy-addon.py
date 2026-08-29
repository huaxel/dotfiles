"""
Antigravity usage interceptor — mitmproxy addon.

Intercepts agy's API calls to daily-cloudcode-pa.googleapis.com and
extracts usageMetadata (token counts) from the response, then appends
to ~/.config/antigravity-usage/usage.jsonl.

Works for both non-streaming JSON and streaming SSE responses (buffered).
"""

import json
import os
import re
from datetime import datetime, timezone

USAGE_LOG = os.path.expanduser("~/.config/antigravity-usage/usage.jsonl")
LOG_DIR = os.path.dirname(USAGE_LOG)

# Matches agy's API host (production, daily, autopush variants)
API_HOST_SUFFIX = "cloudcode-pa.googleapis.com"
# Endpoints that carry usage metadata
API_PATH_SUFFIXES = (":generateContent", ":streamGenerateContent")

SSE_DATA_RE = re.compile(r'^data:\s*(.*)', re.MULTILINE)


def _log_usage(model, inp, out, total, rid):
    os.makedirs(LOG_DIR, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "inputTokens": inp,
        "outputTokens": out,
        "totalTokens": total,
        "responseId": rid,
    }
    with open(USAGE_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def _parse_usage(body: str) -> tuple | None:
    """Extract usageMetadata from a JSON or SSE response body.

    For SSE streams the usageMetadata sits in the LAST data event;
    we scan for it across all data: lines and return the last one found.
    Returns (model, inputTokens, outputTokens, totalTokens, responseId)
    or None if no usageMetadata is present.
    """
    # Try SSE: scan all data: lines, keep the last one with usageMetadata
    last_resp = None
    for m in SSE_DATA_RE.finditer(body):
        raw = m.group(1).strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
            resp = ev.get("response") or ev
            if "usageMetadata" in resp:
                last_resp = resp
        except json.JSONDecodeError:
            continue

    if last_resp:
        u = last_resp.get("usageMetadata") or {}
        return (
            last_resp.get("modelVersion"),
            u.get("promptTokenCount", 0),
            u.get("candidatesTokenCount", 0),
            u.get("totalTokenCount", 0),
            last_resp.get("responseId"),
        )

    # Fallback: try parsing as plain JSON
    try:
        data = json.loads(body)
        resp = data.get("response") or data
        u = resp.get("usageMetadata") or {}
        if u.get("totalTokenCount"):
            return (
                resp.get("modelVersion"),
                u.get("promptTokenCount", 0),
                u.get("candidatesTokenCount", 0),
                u.get("totalTokenCount", 0),
                resp.get("responseId"),
            )
    except json.JSONDecodeError:
        pass

    return None


# ── mitmproxy hooks ──────────────────────────────────────────────────


def response(flow):
    """Inspect response and log usageMetadata if present."""
    # Match any variant of cloudcode-pa.googleapis.com
    if API_HOST_SUFFIX not in flow.request.pretty_host:
        return

    # Strip query string before matching path suffix
    path = flow.request.path.split('?')[0]
    if not path.endswith(API_PATH_SUFFIXES):
        return

    # Don't bother if no body
    body = flow.response.text or ""
    if not body.strip():
        return

    usage = _parse_usage(body)
    if usage and usage[3] > 0:  # totalTokens > 0
        _log_usage(*usage)
