import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewerHeaders } from "./session-headers.ts";

test("adds OpenCode routing headers without dropping auth headers", () => {
  assert.deepEqual(
    buildReviewerHeaders("opencode-go", "ap-review-123", { Authorization: "Bearer key" }),
    {
      Authorization: "Bearer key",
      "x-opencode-session": "ap-review-123",
      "x-opencode-client": "pi",
    },
  );
});

test("does not add OpenCode headers to other reviewers", () => {
  assert.deepEqual(
    buildReviewerHeaders("openai-codex", "ap-review-123", { Authorization: "Bearer key" }),
    { Authorization: "Bearer key" },
  );
});
