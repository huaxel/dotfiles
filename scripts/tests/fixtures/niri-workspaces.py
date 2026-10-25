#!/usr/bin/env python3
"""Stateful Niri IPC double; never connects to a compositor."""
import json
import os
from pathlib import Path
import sys

path = Path(os.environ["NIRI_TEST_STATE"])
state = json.loads(path.read_text())
args = sys.argv[1:]


def finish(value=None, code=0):
    path.write_text(json.dumps(state))
    if value is not None:
        print(json.dumps(value))
    sys.exit(code)


def location(workspace):
    for output, ids in state["monitors"].items():
        if workspace in ids:
            return output, ids.index(workspace)
    raise ValueError(workspace)


if args == ["msg", "-j", "outputs"]:
    finish({output: {"logical": {} if output in state["connected"] else None}
            for output in state["monitors"]})
if args == ["msg", "-j", "workspaces"]:
    finish([{"id": workspace, "name": str(workspace), "output": output,
             "idx": index + 1, "is_focused": workspace == state["focus"]}
            for output, ids in state["monitors"].items()
            for index, workspace in enumerate(ids)])
if args[:2] != ["msg", "action"]:
    finish(code=2)
action, value = args[2:]
state.setdefault("actions", []).append([action, value])
hotplug = state.get("disconnect_before")
if hotplug and action == hotplug["action"] and not state.get("disconnected"):
    output = hotplug["output"]
    state["connected"].remove(output)
    fallback = hotplug["fallback"]
    state["monitors"][fallback].extend(state["monitors"].pop(output))
    state["disconnected"] = True
if action == state.get("fail_action") and not state.get("failed"):
    state["failed"] = True
    finish(code=19)
if action == "focus-monitor":
    if value not in state["connected"] or not state["monitors"][value]:
        finish(code=20)
    state["focus"] = state["monitors"][value][0]
elif action == "focus-workspace":
    output, _ = location(state["focus"])
    state["focus"] = state["monitors"][output][int(value) - 1]
elif action == "move-workspace-to-monitor":
    if value not in state["connected"]:
        finish(code=20)
    output, _ = location(state["focus"])
    state["monitors"][output].remove(state["focus"])
    state["monitors"][value].append(state["focus"])
elif action == "move-workspace-to-index":
    output, _ = location(state["focus"])
    state["monitors"][output].remove(state["focus"])
    state["monitors"][output].insert(int(value) - 1, state["focus"])
else:
    finish(code=2)
finish()
