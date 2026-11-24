# `marimo._code_mode` API surface

A point-in-time snapshot of the agent API, useful for orientation before your first
`dir(ctx)`. The live API changes between marimo versions, so verify against the running
kernel rather than trusting this table.

## Entry point

```python
import marimo._code_mode as cm

async with cm.get_context() as ctx:
    ...  # all operations go here
```

The `async with` is mandatory: without it, operations silently do nothing. The context
manager compile-checks on exit, so syntax errors, multiply-defined names, and cycles are
caught before any graph mutation occurs.

## Context object (`ctx`)

### Reading state

| Attribute or method | Returns | Notes |
|---|---|---|
| `ctx.cells` | List of cell objects | Each has `.cell_id`, `.code`, `.name` |
| `ctx.graph` | Kernel graph | Holds refs/defs; the cells themselves do not |
| `dir(ctx)` | All attributes | Always check this first, the API evolves |

### Cell operations (mutating)

| Operation | Method | Notes |
|---|---|---|
| Create cell | `ctx.create_cell(code, ...)` | Adds to the graph and compile-checks |
| Edit cell | `ctx.edit_cell(cell_id, code, ...)` | Edits an existing cell in place |
| Delete cell | `ctx.delete_cell(cell_id)` | Confirm with the user first |
| Move cell | `ctx.move_cell(cell_id, ...)` | Reorders within the notebook |

### Execution

| Operation | Method | Notes |
|---|---|---|
| Run code in the scratchpad | `scripts/execute-code.sh` or the MCP server | Results return to the agent, not the user |
| Run a cell | `ctx.run_cell(cell_id)` | Queues execution; `create_cell` and `edit_cell` are structural only |

### Package management

| Operation | Method | Notes |
|---|---|---|
| Install a package | Explore with `dir(ctx)` | Prefer a code-mode API over `uv add` when one exists |

## Known friction points

- **Compile-check false positives on delete plus create.** Deleting a cell and creating a
  replacement that defines the same variables can fail the compile check, because the old
  definitions are still visible. Use `check=False`, or `edit_cell` instead of
  delete-then-create.
- **`ctx.cells` lacks refs and defs.** Cell objects do not expose the names they reference
  or define. Use `ctx.graph` for variable-flow analysis.
