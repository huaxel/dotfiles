import { appendFileSync } from "node:fs";
import { getLogFilePath } from "./agent-dir.ts";

export function log(message: string): void {
  try {
    appendFileSync(
      getLogFilePath(),
      `${new Date().toISOString()} ${message}\n`,
      "utf-8",
    );
  } catch {
    // ignored
  }
}
