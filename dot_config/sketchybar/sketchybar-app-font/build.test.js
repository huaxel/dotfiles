import { test, mock } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import child_process from "node:child_process";
import * as buildModule from "./build.js";

test("build function", (t) => {
  // Mock execSync
  const execSyncMock = mock.method(
    child_process,
    "execSync",
    (command, options) => {
      assert.strictEqual(command, "./node_modules/.bin/svgtofont -s svgs/ -o dist/");
    },
  );

  // Mock fs.readdirSync
  mock.method(fs, "readdirSync", (path) => {
    if (path === "./mappings") {
      return ["Slack.svg"];
    }
    return [];
  });

  // Mock fs.readFileSync
  mock.method(fs, "readFileSync", (path) => {
    if (path === "./mappings/Slack.svg") {
      return 'Slack | "Slack"';
    }
    return "";
  });

  // Track writeFileSync calls
  const writes = {};
  mock.method(fs, "writeFileSync", (path, data) => {
    writes[path] = data;
  });

  // Mock fs.chmodSync
  const chmodMock = mock.method(fs, "chmodSync", () => {});

  // Run build
  buildModule.build();

  // Assertions
  assert.strictEqual(writes["./dist/icon_map.sh"].includes("### START-OF-ICON-MAP"), true, "Should contain correct start marker");
  assert.strictEqual(writes["./dist/icon_map.sh"].includes("### END-OF-ICON-MAP"), true, "Should contain correct end marker");
  assert.strictEqual(writes["./dist/icon_map.sh"].includes('Slack | "Slack"'), true);

  assert.strictEqual(writes["./dist/icon_map.lua"].includes('\t[Slack] = "Slack",'), true);
  assert.strictEqual(writes["./dist/icon_map.lua"].includes('\t["Slack"] = "Slack",'), true);

  const jsonContent = JSON.parse(writes["./dist/icon_map.json"]);
  assert.deepStrictEqual(jsonContent, [
    {
      iconName: "Slack",
      appNames: ["Slack", "Slack"],
    },
  ]);

  assert.strictEqual(chmodMock.mock.calls[0].arguments[1], 0o755);
});
