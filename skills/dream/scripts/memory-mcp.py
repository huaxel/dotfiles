#!/usr/bin/env python3
"""Read-only MCP server over the local pi memory directory.

Why this exists
---------------
pi injects the memory INDEX into its own sessions, but other harnesses
(Claude Code, Codex, Cursor, Copilot) have no way to search memory. The
obvious fix is to run an existing memory MCP server, but every candidate
tried writes to the notes it indexes:

  * Basic Memory rewrites frontmatter into every file it indexes, even with
    `ensure_frontmatter_on_sync = false`. Pointed at the memory repo it would
    rewrite every entry, invalidating the privacy-reviewed line bindings and
    fighting the merge driver. Pointed at a read-only mirror it fails to index
    all 72 files with EACCES.
  * Its MCP surface also exposes bm_write/bm_edit/bm_delete/bm_move, which
    would let any connected client bypass the single-writer rule and the
    privacy gate.

So this server is deliberately minimal and read-only: search, read, list.
It never writes, it has no write tools to filter, and it runs over stdio, so
no port is opened and no authentication is required. Every machine already
has the memory clone through git, so a local stdio server is both simpler and
safer than hosting one centrally.

Memory layout it reads (all optional except the first two):
  MEMORY.md, SCRATCHPAD.md, daily/*.md, archive/*.md, recovery/*.md,
  projects/*/MEMORY.md, projects/*/daily/*.md

Excluded on purpose: .git/, dream/ (local fragments), sessions/.

Usage:
  memory-mcp.py                 # stdio MCP server
  memory-mcp.py --selftest      # run deterministic checks, no MCP
  memory-mcp.py --search QUERY  # ad-hoc search from a shell

Set PI_MEMORY_DIR to point at another clone.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys

MEM_DIR = pathlib.Path(
    os.environ.get("PI_MEMORY_DIR") or pathlib.Path.home() / ".pi" / "agent" / "memory"
).resolve()

# Directories never indexed. dream/ holds machine-local fragments; .git/ is
# history; sessions/ would be raw traces if a clone ever contains them.
SKIP_DIRS = {".git", "dream", "sessions", "node_modules"}

# Markdown files that count as memory. Everything else is ignored so a stray
# file in the clone cannot widen the read surface.
INCLUDE_GLOBS = (
    "MEMORY.md",
    "SCRATCHPAD.md",
    "daily/*.md",
    "archive/*.md",
    "recovery/*.md",
    "projects/*/MEMORY.md",
    "projects/*/daily/*.md",
)

WORD = re.compile(r"[a-z0-9_]+")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def tokenize(text: str) -> list[str]:
    return WORD.findall(text.lower())


def memory_files() -> list[pathlib.Path]:
    """Every included memory file, sorted, with nothing outside the clone."""
    if not MEM_DIR.is_dir():
        return []
    found: list[pathlib.Path] = []
    for pattern in INCLUDE_GLOBS:
        for path in MEM_DIR.glob(pattern):
            if not path.is_file():
                continue
            rel = path.relative_to(MEM_DIR)
            if any(part in SKIP_DIRS for part in rel.parts):
                continue
            found.append(path)
    return sorted(set(found))


def safe_path(rel: str) -> pathlib.Path | None:
    """Resolve a caller-supplied path inside the clone, or None if it escapes."""
    if not rel or "\x00" in rel:
        return None
    candidate = (MEM_DIR / rel).resolve()
    try:
        candidate.relative_to(MEM_DIR)
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    if any(part in SKIP_DIRS for part in candidate.relative_to(MEM_DIR).parts):
        return None
    return candidate


# Parsed chunks keyed by (mtime_ns, size). The server is long-lived, so a warm
# cache turns a 2s full-corpus scan into milliseconds. Any edit changes mtime,
# so a stale entry is never served.
_CHUNK_CACHE: dict[pathlib.Path, tuple[tuple[int, int], list[dict]]] = {}


def chunks(path: pathlib.Path) -> list[dict]:
    """Split a file into heading-scoped chunks so results carry context."""
    try:
        stat = path.stat()
    except OSError:
        return []
    stamp = (stat.st_mtime_ns, stat.st_size)
    cached = _CHUNK_CACHE.get(path)
    if cached is not None and cached[0] == stamp:
        return cached[1]
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    out: list[dict] = []
    heading = ""
    start = 1
    body: list[str] = []

    def flush(end: int) -> None:
        if body:
            out.append(
                {"heading": heading, "start": start, "end": end, "text": "\n".join(body)}
            )

    for number, line in enumerate(text.splitlines(), start=1):
        match = HEADING.match(line)
        if match:
            flush(number - 1)
            heading = match.group(2).strip()
            start = number
            body = [line]
        else:
            body.append(line)
    flush(len(text.splitlines()))
    _CHUNK_CACHE[path] = (stamp, out)
    return out


def search(query: str, limit: int = 8) -> list[dict]:
    """Rank heading-scoped chunks against the query with a small BM25.

    Deterministic and dependency-free: no embeddings, no model download. The
    corpus is small enough that scoring every chunk per query is cheap.
    """
    terms = tokenize(query)
    if not terms:
        return []
    unique = list(dict.fromkeys(terms))
    files = memory_files()
    if not files:
        return []

    docs: list[tuple[pathlib.Path, dict, list[str]]] = []
    for path in files:
        for chunk in chunks(path):
            docs.append((path, chunk, tokenize(chunk["text"])))
    if not docs:
        return []

    total = len(docs)
    avg_len = sum(len(d[2]) for d in docs) / total or 1.0
    doc_freq = {t: sum(1 for d in docs if t in d[2]) for t in unique}
    k1, b = 1.5, 0.75

    scored: list[tuple[float, pathlib.Path, dict]] = []
    for path, chunk, tokens in docs:
        length = len(tokens) or 1
        score = 0.0
        for term in unique:
            tf = tokens.count(term)
            if not tf:
                continue
            idf = 1.0 + (total - doc_freq[term] + 0.5) / (doc_freq[term] + 0.5)
            score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * length / avg_len))
        if score > 0:
            scored.append((score, path, chunk))

    scored.sort(key=lambda item: (-item[0], str(item[1]), item[2]["start"]))
    results = []
    for score, path, chunk in scored[:limit]:
        snippet = " ".join(chunk["text"].split())[:400]
        results.append(
            {
                "file": str(path.relative_to(MEM_DIR)),
                "line": chunk["start"],
                "heading": chunk["heading"],
                "score": round(score, 3),
                "snippet": snippet,
            }
        )
    return results


def read_file(rel: str, start: int | None = None, end: int | None = None) -> dict:
    path = safe_path(rel)
    if path is None:
        raise ValueError(f"not a readable memory file: {rel}")
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    first = max(1, start or 1)
    last = min(len(lines), end or len(lines))
    if last < first:
        raise ValueError(f"empty range: start={first} end={last}")
    body = "\n".join(f"{n}: {lines[n - 1]}" for n in range(first, last + 1))
    return {
        "file": str(path.relative_to(MEM_DIR)),
        "start": first,
        "end": last,
        "total_lines": len(lines),
        "content": body,
    }


def list_files() -> list[dict]:
    return [
        {"file": str(p.relative_to(MEM_DIR)), "bytes": p.stat().st_size}
        for p in memory_files()
    ]


TOOLS = [
    {
        "name": "memory_search",
        "description": (
            "Search the owner's long-term agent memory (curated MEMORY.md, scratchpad, "
            "daily logs, archive, per-project memory). Use this before assuming how the "
            "owner wants something done, or to recall earlier decisions and project "
            "status. Returns ranked excerpts with file and line."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keywords or a question."},
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 8, max 25).",
                    "minimum": 1,
                    "maximum": 25,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "memory_read",
        "description": (
            "Read a memory file by path, optionally a line range. Paths are the ones "
            "returned by memory_search or memory_list. Read-only."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path relative to the memory root."},
                "start": {"type": "integer", "description": "First line (1-based)."},
                "end": {"type": "integer", "description": "Last line (inclusive)."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "memory_list",
        "description": "List the memory files available to search, with sizes.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def call_tool(name: str, args: dict) -> str:
    if name == "memory_search":
        query = str(args.get("query") or "").strip()
        if not query:
            raise ValueError("query is required")
        limit = int(args.get("limit") or 8)
        limit = max(1, min(25, limit))
        results = search(query, limit)
        if not results:
            return f"No memory matches for {query!r}."
        return json.dumps(results, indent=2)
    if name == "memory_read":
        rel = str(args.get("path") or "")
        start = args.get("start")
        end = args.get("end")
        return json.dumps(
            read_file(rel, int(start) if start else None, int(end) if end else None),
            indent=2,
        )
    if name == "memory_list":
        return json.dumps(list_files(), indent=2)
    raise ValueError(f"unknown tool: {name}")


def handle(request: dict) -> dict | None:
    method = request.get("method")
    rid = request.get("id")

    # Notifications carry no id and must never be answered.
    if rid is None:
        return None

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "protocolVersion": "2025-06-18",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "pi-memory", "version": "1.0.0"},
            },
        }
    if method == "ping":
        return {"jsonrpc": "2.0", "id": rid, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": rid, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = request.get("params") or {}
        name = params.get("name")
        args = params.get("arguments") or {}
        try:
            text = call_tool(str(name), args)
            result = {"content": [{"type": "text", "text": text}]}
        except Exception as exc:  # tool errors are reported, not fatal
            result = {
                "content": [{"type": "text", "text": f"error: {exc}"}],
                "isError": True,
            }
        return {"jsonrpc": "2.0", "id": rid, "result": result}

    return {
        "jsonrpc": "2.0",
        "id": rid,
        "error": {"code": -32601, "message": f"method not found: {method}"},
    }


def serve() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle(request)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
    return 0


def selftest() -> int:
    """Deterministic checks. No network, no writes, no model calls."""
    failures: list[str] = []

    def check(label: str, condition: bool) -> None:
        print(f"{'ok  ' if condition else 'FAIL'} {label}")
        if not condition:
            failures.append(label)

    files = memory_files()
    check(f"found memory files ({len(files)})", len(files) > 0)
    check("no dream/ files indexed", not any("dream/" in str(p) for p in files))
    check("no .git files indexed", not any("/.git/" in str(p) for p in files))

    # Path safety: traversal and absolute paths must be refused.
    for bad in ("../MEMORY.md", "/etc/passwd", "dream/2026-11-09.md", "nope.md"):
        check(f"refuses {bad}", safe_path(bad) is None)
    check("accepts MEMORY.md", safe_path("MEMORY.md") is not None)

    # Search returns ranked, in-clone results.
    results = search("memory sync merge driver", 5)
    check("search returns results", len(results) > 0)
    check(
        "search results stay inside the clone",
        all(not r["file"].startswith(("/", "..")) for r in results),
    )
    check(
        "search scores descend",
        all(results[i]["score"] >= results[i + 1]["score"] for i in range(len(results) - 1)),
    )

    # Read returns numbered lines within range.
    if files:
        rel = str(files[0].relative_to(MEM_DIR))
        got = read_file(rel, 1, 3)
        check("read returns requested range", got["start"] == 1 and got["end"] <= 3)

    # The tool surface must contain no write capability.
    names = {tool["name"] for tool in TOOLS}
    check("tool surface is exactly read-only", names == {"memory_search", "memory_read", "memory_list"})

    # Protocol behavior.
    init = handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    check("initialize answers", init is not None and init["result"]["serverInfo"]["name"] == "pi-memory")
    check("notification is not answered", handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None)
    unknown = handle({"jsonrpc": "2.0", "id": 2, "method": "nope"})
    check("unknown method errors", unknown is not None and unknown["error"]["code"] == -32601)

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        return selftest()
    if "--search" in argv:
        index = argv.index("--search")
        query = " ".join(argv[index + 1 :])
        if not query:
            print("usage: memory-mcp.py --search QUERY", file=sys.stderr)
            return 2
        print(json.dumps(search(query), indent=2))
        return 0
    return serve()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
