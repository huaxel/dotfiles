import assert from "node:assert/strict";
import test from "node:test";

const { fetchModels, toModelConfig } = await import("./models.ts");

test("toModelConfig preserves capabilities and maps reasoning metadata", () => {
  const model = toModelConfig({
    id: "Qwen3.7 Plus",
    context_length: 262144,
    max_output_tokens: 32768,
    reasoning: { supported_efforts: ["high", "low"] },
  });

  assert.equal(model.id, "Qwen3.7 Plus");
  assert.equal(model.contextWindow, 262144);
  assert.equal(model.maxTokens, 32768);
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.input, ["text", "image"]);
});

test("fetchModels filters malformed catalog entries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.headers?.Authorization, "Bearer test-key");
    return new Response(JSON.stringify({
      data: [
        { id: "valid-model" },
        { id: "" },
        { id: 42 },
        {},
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    assert.deepEqual(await fetchModels("test-key"), [{ id: "valid-model" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
