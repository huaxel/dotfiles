import { homedir } from "node:os";
import { join } from "node:path";

export function getAgentDir(): string {
  return (
    process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent")
  );
}

export function getAuthJsonPath(): string {
  return join(getAgentDir(), "auth.json");
}

export function getStateFilePath(): string {
  return join(getAgentDir(), "opencode-go-failover-state.json");
}

export function getLogFilePath(): string {
  return join(getAgentDir(), "opencode-go-failover.log");
}
