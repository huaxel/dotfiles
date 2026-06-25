---
name: jules-session-management
description: "Manage Jules coding sessions programmatically: create, list, inspect, interact with, pull results from, and delete sessions via the REST API and CLI."
disable-model-invocation: true
---

# Jules Session Management

## Overview

Jules sessions are units of work where an AI coding agent executes a task on your repository. This skill covers managing them via the [Jules REST API](https://jules.google/docs/api/reference/sessions) and CLI.

**REST API base:** `https://jules.googleapis.com/v1alpha`
**Auth:** `X-Goog-Api-Key` header. Get your key at [jules.google.com/settings](https://jules.google.com/settings). Store in `JULES_API_KEY` env var.

```bash
curl -H "x-goog-api-key: $JULES_API_KEY" https://jules.googleapis.com/v1alpha/sessions
```

## Session States

Sessions progress through these states:

| State | Meaning |
|-------|---------|
| `QUEUED` | Waiting to be processed |
| `PLANNING` | Analyzing task, creating a plan |
| `AWAITING_PLAN_APPROVAL` | Plan ready, waiting for user approval |
| `AWAITING_USER_FEEDBACK` | Needs additional input from user |
| `IN_PROGRESS` | Actively working |
| `PAUSED` | Paused |
| `COMPLETED` | Task finished successfully |
| `FAILED` | Task failed |

## CLI Reference

The `jules` CLI is the primary surface. Installed globally via `npm install -g @google/jules`.

### List sessions

```bash
jules remote list --session
jules remote list --repo          # list connected repos
```

### Create a session

```bash
jules remote new "write unit tests"
jules remote new --repo owner/repo "fix bug in auth"
jules remote new --parallel 3 "try 3 different approaches"
```

### Pull results

```bash
jules remote pull --session SESSION_ID
jules remote pull --session SESSION_ID --apply   # apply patch locally
```

### Teleport (full workspace clone)

```bash
jules teleport SESSION_ID
```

### TUI (interactive dashboard)

```bash
jules   # launch terminal UI to browse/manage sessions
```

## REST API

### List sources (find your repo name)

```bash
curl -H "x-goog-api-key: $JULES_API_KEY" \
  "https://jules.googleapis.com/v1alpha/sources?pageSize=50"
```

### Create a session

```bash
curl -X POST \
  -H "x-goog-api-key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add comprehensive unit tests for the auth module",
    "title": "Add auth tests",
    "sourceContext": {
      "source": "sources/github-owner-repo",
      "githubRepoContext": {
        "startingBranch": "main"
      }
    },
    "requirePlanApproval": true,
    "automationMode": "AUTO_CREATE_PR"
  }' \
  "https://jules.googleapis.com/v1alpha/sessions"
```

Fields:
- `prompt` (required) — task description
- `title` (optional) — human-readable label
- `sourceContext` (optional for repoless sessions)
- `requirePlanApproval` — if true, plans need explicit approval via `:approvePlan`
- `automationMode` — `"AUTO_CREATE_PR"` to auto-create PRs when ready

### List sessions

```bash
curl -H "x-goog-api-key: $JULES_API_KEY" \
  "https://jules.googleapis.com/v1alpha/sessions?pageSize=50"
```

Returns `nextPageToken` when more pages exist. Use `&pageToken=NEXT_TOKEN` to paginate.

### Get a single session

```bash
curl -H "x-goog-api-key: $JULES_API_KEY" \
  "https://jules.googleapis.com/v1alpha/sessions/SESSION_ID"
```

Response includes `outputs` (e.g., pull request URLs) when completed.

### List activities (progress, messages, artifacts)

```bash
curl -H "x-goog-api-key: $JULES_API_KEY" \
  "https://jules.googleapis.com/v1alpha/sessions/SESSION_ID/activities?pageSize=50"
```

Activities contain event types: `planGenerated`, `planApproved`, `userMessaged`, `agentMessaged`, `progressUpdated`, `sessionCompleted`, `sessionFailed`. They may include artifacts: `changeSet` (git patches), `bashOutput`, `media` (screenshots).

### Send a message to a session

```bash
curl -X POST \
  -H "x-goog-api-key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Can you also add integration tests?"}' \
  "https://jules.googleapis.com/v1alpha/sessions/SESSION_ID:sendMessage"
```

### Approve a plan

Only needed when `requirePlanApproval` was set on creation.

```bash
curl -X POST \
  -H "x-goog-api-key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://jules.googleapis.com/v1alpha/sessions/SESSION_ID:approvePlan"
```

### Delete a session

```bash
curl -X DELETE \
  -H "x-goog-api-key: $JULES_API_KEY" \
  "https://jules.googleapis.com/v1alpha/sessions/SESSION_ID"
```

Returns `200 {}` on success. 404 means the session doesn't exist (already deleted or on a different backend).

## Bulk Cleanup

### Delete all completed sessions

```bash
for sid in $(curl -s "https://jules.googleapis.com/v1alpha/sessions?pageSize=50" \
  -H "x-goog-api-key: $JULES_API_KEY" \
  | python3 -c "import json,sys
d = json.load(sys.stdin)
for s in d.get('sessions', []):
    if s.get('state') == 'COMPLETED':
        print(s['id'])
"); do
  curl -s -X DELETE "https://jules.googleapis.com/v1alpha/sessions/$sid" \
    -H "x-goog-api-key: $JULES_API_KEY" > /dev/null && echo "Deleted $sid"
done
```

### Delete all sessions in a given state

Change `COMPLETED` to `AWAITING_USER_FEEDBACK`, `FAILED`, etc.

### Pagination helper

```bash
python3 -c "
import json, subprocess, os
api_key = os.environ['JULES_API_KEY']
page_token = ''
total = 0
while True:
    url = 'https://jules.googleapis.com/v1alpha/sessions?pageSize=50'
    if page_token:
        url += '&pageToken=' + page_token
    r = subprocess.run(['curl', '-s', url, '-H', 'x-goog-api-key: ' + api_key],
        capture_output=True, text=True)
    d = json.loads(r.stdout)
    for s in d.get('sessions', []):
        if s.get('state') == 'COMPLETED':
            sid = s['id']
            subprocess.run(['curl', '-s', '-X', 'DELETE',
                'https://jules.googleapis.com/v1alpha/sessions/' + sid,
                '-H', 'x-goog-api-key: ' + api_key], capture_output=True)
            total += 1
            print(f'Deleted {sid}')
    page_token = d.get('nextPageToken', '')
    if not page_token:
        break
print(f'Done. Deleted {total} sessions.')
"
```

## Notes

- Deleting a session does **not** affect any PRs or branches it created — those stay on GitHub.
- The REST API (`jules.googleapis.com/v1alpha`) covers most sessions. Very old sessions created via the legacy `aida.googleapis.com/v1/swebot` gRPC backend may not be reachable.
- After cleanup, use `jules remote list --session` or `jules_list_sessions` MCP tool to verify.
- You can have at most 3 API keys at a time. Generate/revoke them at [jules.google.com/settings](https://jules.google.com/settings).
