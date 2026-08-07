---
name: orchestrator
description: Use when the agent needs to create, claim, or manage tasks through the orchestrator queue system. Covers task enqueueing, claiming, completion reporting, subtask chaining, and monitoring.
---

# Orchestrator

## Overview

The orchestrator is a centralized task queue and dispatch system. Agents interact with it via a local HTTP API running on `http://localhost:8090`. It manages task scheduling, rate limiting, worker registration, and usage tracking.

**Core principle:** Don't do work directly when the orchestrator can handle it. Let the orchestrator decide which model/agent is best suited for each task.

## Quick Reference

| Action | Method | Endpoint |
|--------|--------|----------|
| Enqueue task | `POST` | `/api/tasks` |
| List tasks | `GET` | `/api/tasks?status=pending&kind=github_issue` |
| Get task details | `GET` | `/api/tasks/:id` |
| Claim next task | `GET` | `/api/tasks/next?worker=my-agent` |
| Report result | `POST` | `/api/tasks/:id/result` |
| Register worker | `POST` | `/api/workers` |
| Send heartbeat | `POST` | `/api/workers/:id/heartbeat` |
| Check usage | `GET` | `/api/usage?days=7` |
| View dashboard | GET | `http://localhost:8090/` |

## Enqueueing a Task

When you need to create a task (e.g., analyze code, run a test, generate content), create it via the orchestrator:

```bash
curl -X POST http://localhost:8090/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "kind": "github_issue",
    "prompt": "Review PR #42 for security issues",
    "model": "deepseek-v4-flash",
    "priority": 5,
    "trust_level": "agent",
    "depends_on": []
  }'
```

### Task fields

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Task category: `prompt`, `github_issue`, `code_review`, `test`, `research` |
| `prompt` | string | The task description/instructions |
| `model` | string | Preferred model: `deepseek-v4-flash`, `mimo-v2.5`, `qwen3.6`, `gemma4` |
| `priority` | number | Higher = processed first (default: 0) |
| `trust_level` | string | `agent` (default), `trusted_agent`, or `human` |
| `depends_on` | string[] | Array of task IDs this task depends on |
| `source` | string | Who created the task (your agent ID) |

### When to enqueue vs do directly

- **Enqueue** when: the work could be done by any agent, you want cost optimization, or the task is part of a chain
- **Do directly** when: you need immediate results and the task is simple

## Claiming a Task

When you have capacity to do work, claim the next available task:

```bash
curl "http://localhost:8090/api/tasks/next?worker=my-agent&kind=github_issue"
```

Returns the task object with `status: "running"` if one was available. Returns 204 No Content if the queue is empty.

## Reporting Results

After completing a task, report the result:

```bash
curl -X POST http://localhost:8090/api/tasks/TASK_ID/result \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "succeeded",
    "branch": "fix/security-issue",
    "usage": {
      "provider": "nan-builder",
      "model": "deepseek-v4-flash",
      "inputTokens": 1500,
      "outputTokens": 800,
      "totalCost": 0.012
    }
  }'
```

For failures:

```bash
curl -X POST http://localhost:8090/api/tasks/TASK_ID/result \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "failed",
    "error": "Rate limit exceeded on nan-builder"
  }'
```

## Task Chaining (Subtasks)

When completing a task, you can create subtasks that depend on it:

1. Complete the parent task
2. Enqueue new tasks with `depends_on: ["PARENT_TASK_ID"]`

The orchestrator will not claim dependent tasks until the parent succeeds.

## Worker Registration

Register yourself as a worker so the orchestrator knows you exist:

```bash
curl -X POST http://localhost:8090/api/workers \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "my-agent-1",
    "name": "Jules",
    "capabilities": ["coding", "code_review"],
    "model": "deepseek-v4-flash"
  }'
```

Send heartbeats periodically:

```bash
curl -X POST http://localhost:8090/api/workers/my-agent-1/heartbeat
```

## Monitoring

Check the dashboard at `http://localhost:8090/` to see:
- Pending/running/succeeded/failed counts
- Recent tasks with status and timing
- Rate limit usage
- 7-day cost summary

Or via API:

```bash
# Task counts
curl "http://localhost:8090/api/tasks?limit=50"

# Usage summary
curl "http://localhost:8090/api/usage?days=7"

# Rate limits
curl "http://localhost:8090/api/rate-limits"
```

## Rate Limits

The orchestrator enforces these limits for the nan-builder API key:

| Limit | Value |
|-------|-------|
| Requests per minute | 60 |
| Concurrent requests | 5 |
| Tokens per minute (per model) | 1,500,000 |

The orchestrator handles rate limiting automatically. Workers should not need to manage it manually.

## Common Patterns

### Process a batch of tasks

```bash
# Claim and process one task at a time
TASK=$(curl -s "http://localhost:8090/api/tasks/next?worker=my-agent")
if [ -n "$TASK" ]; then
  # process $TASK
  TASK_ID=$(echo $TASK | jq -r .id)
  curl -X POST "http://localhost:8090/api/tasks/$TASK_ID/result" \
    -H 'Content-Type: application/json' \
    -d '{"status": "succeeded"}'
fi
```

### Check queue status before working

```bash
curl -s "http://localhost:8090/api/tasks?status=pending" | jq length
```

### List tasks by kind

```bash
curl -s "http://localhost:8090/api/tasks?kind=github_issue&status=running"
```
