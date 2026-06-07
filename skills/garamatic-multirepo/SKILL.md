---
name: garamatic-multirepo
description: Manage the Garamatic microservices multirepo - 6 repos (garamatic-web, ticket-masala, masala-web, mailing-service, event-planner, integration-contracts). Use when working across multiple services, updating shared contracts, or coordinating changes.
---

# Garamatic Multirepo Management

## Repositories

| Repo | Type | Purpose |
|------|------|---------|
| `garamatic-web` | Frontend | Main web application |
| `masala-web` | Frontend | Secondary web application |
| `ticket-masala` | Backend | Ticket service |
| `mailing-service` | Backend | Email service |
| `event-planner` | Backend | Event planning service |
| `integration-contracts` | Shared | API contracts, types, schemas |

## Common Workflows

### 1. Update Shared Contracts

When `integration-contracts` changes, propagate to all dependent services:

```bash
# 1. Tag current state
context_tag({ name: "contract-update-start" })

# 2. Update contracts repo first
cd integration-contracts
# ... make changes ...

# 3. Parallel update all services that depend on it
subagent({
  tasks: [
    { agent: "worker", task: "Update ticket-masala to use new contract v2", cwd: "ticket-masala" },
    { agent: "worker", task: "Update mailing-service to use new contract v2", cwd: "mailing-service" },
    { agent: "worker", task: "Update event-planner to use new contract v2", cwd: "event-planner" }
  ]
})
```

### 2. Cross-Service Feature

For features spanning multiple services:

```bash
# Create worktrees for isolation
# Each service gets its own worktree for the feature branch
git -C ticket-masala worktree add ../.worktrees/ticket-feature-auth -b feature/auth
git -C event-planner worktree add ../.worktrees/planner-feature-auth -b feature/auth
```

### 3. Run Tests Across All Services

```bash
# Quick health check of all services
for dir in */; do
  if [ -f "$dir/package.json" ]; then
    echo "=== $dir ==="
    (cd "$dir" && npm test 2>&1 | tail -5)
  fi
done
```

## Navigation Shortcuts

| To | Path |
|----|------|
| Contracts | `integration-contracts/` |
| Frontend | `garamatic-web/` or `masala-web/` |
| Services | `ticket-masala/`, `mailing-service/`, `event-planner/` |

## Dependency Graph

```
integration-contracts (shared types)
    ├── ticket-masala
    ├── mailing-service
    └── event-planner

garamatic-web ──► ticket-masala, mailing-service
masala-web ─────► event-planner
```

## Convention: Worktree Location

- Use `.worktrees/` in the container directory
- Already added to container .gitignore
- Format: `.worktrees/<repo>-<feature>/`
