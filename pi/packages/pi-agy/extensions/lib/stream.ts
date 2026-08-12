export interface AgyUsage {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
}

export interface AgyStepUpdate {
  conversation_id?: string;
  step_index?: number;
  state?: string;
  step_type?: string;
  tool_name?: string;
  text_delta?: string;
  duration_seconds?: number;
  usage?: AgyUsage;
  tool_info?: {
    name?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface AgyStreamLine {
  event?: string;
  conversation_id?: string;
  init?: { model?: string; cwd?: string };
  step_update?: AgyStepUpdate;
  result?: {
    conversation_id?: string;
    status?: string;
    response?: string;
    duration_seconds?: number;
    usage?: AgyUsage;
  };
}

export interface AgyRunResult {
  response: string;
  conversation_id?: string;
  usage?: AgyUsage;
  duration_seconds?: number;
}

export type AgyProgressHandler = (message: string) => void;

export function parseStreamLine(line: string): AgyStreamLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as AgyStreamLine;
  } catch {
    return null;
  }
}

export function formatStepProgress(parsed: AgyStreamLine): string | null {
  if (parsed.event === "init") {
    const model = parsed.init?.model ?? "agy";
    return `agy: session started (${model})`;
  }

  const step = parsed.step_update;
  if (!step) return null;

  if (step.step_type === "tool" && step.state === "ACTIVE") {
    const name = step.tool_name ?? step.tool_info?.name ?? "tool";
    const target = step.tool_info?.parameters?.TargetFile;
    return target ? `▸ ${name} → ${String(target)}` : `▸ ${name}`;
  }

  if (step.step_type === "agent_response" && step.text_delta) {
    return step.text_delta;
  }

  if (parsed.event === "result" && parsed.result?.status) {
    const secs = parsed.result.duration_seconds;
    const dur = secs != null ? ` in ${secs.toFixed(1)}s` : "";
    return `agy: ${parsed.result.status}${dur}`;
  }

  return null;
}

export function accumulateRunResult(parsed: AgyStreamLine, current: AgyRunResult): AgyRunResult {
  const next = { ...current };

  if (parsed.conversation_id) next.conversation_id = parsed.conversation_id;
  if (parsed.init && parsed.conversation_id) next.conversation_id = parsed.conversation_id;

  const step = parsed.step_update;
  if (step?.conversation_id) next.conversation_id = step.conversation_id;

  if (parsed.result) {
    if (parsed.result.conversation_id) next.conversation_id = parsed.result.conversation_id;
    if (parsed.result.response != null) next.response = parsed.result.response;
    if (parsed.result.usage) next.usage = parsed.result.usage;
    if (parsed.result.duration_seconds != null) {
      next.duration_seconds = parsed.result.duration_seconds;
    }
  }

  return next;
}

export function finalizeRunResult(rawStdout: string, current: AgyRunResult): AgyRunResult {
  if (current.response) return current;

  // Fall back to plain json envelope or raw text when stream-json had no result event.
  for (const line of rawStdout.split("\n")) {
    const parsed = parseStreamLine(line);
    if (parsed?.result?.response) {
      return accumulateRunResult(parsed, { ...current, response: parsed.result.response });
    }
  }

  try {
    const parsed = JSON.parse(rawStdout);
    if (parsed.response) return { ...current, response: parsed.response };
  } catch {
    // not json
  }

  return { ...current, response: rawStdout.trim() || "(empty response)" };
}
