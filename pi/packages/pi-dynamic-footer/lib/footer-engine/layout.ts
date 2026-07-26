import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { LayoutAssembler } from "./types.js";

export const defaultAssembler: LayoutAssembler = (segments, width, theme) => {
  const sep = " " + theme.fg("dim", "▸") + " ";

  function fit(text: string): string {
    const w = visibleWidth(text);
    if (w > width) return truncateToWidth(text, width);
    if (w < width) return text + " ".repeat(width - w);
    return text;
  }

  // Join non-empty segment strings with the separator; empty segments are
  // dropped before joining so a fully-empty line collapses to "" (and is then
  // filtered out) rather than being padded to a full-width blank line.
  function joinLine(keys: string[]): string {
    return keys
      .map((k) => segments[k] ?? "")
      .filter((s) => visibleWidth(s) > 0)
      .join(sep);
  }

  // Line 1 — current generation state
  const line1 = joinLine(["turnCount", "modelThink", "tps", "contextUsage"]);
  // Line 2 — session / accounting
  const line2 = joinLine(["runtime", "pwd", "git", "tokens", "cache", "cost"]);
  // Line 3 — quota bars only (separate line so it doesn't crowd accounting)
  const line3 = segments["usageBars"] ?? "";

  const hasBars = visibleWidth(line3) > 0;
  const fits = visibleWidth(line1) <= width && visibleWidth(line2) <= width;

  if (fits) {
    const twoLine = [line1, line2]
      .filter((line) => visibleWidth(line) > 0)
      .map(fit);
    return hasBars ? [...twoLine, truncateToWidth(line3, width)] : twoLine;
  }

  // Narrow fallback: split accounting across two lines
  //   [1] # + model + tps + ctx
  //   [2] runtime + pwd + git
  //   [3] tokens + cache + cost
  //   [4] usageBars  (if present)
  const l1 = joinLine(["turnCount", "modelThink", "tps", "contextUsage"]);
  const l2 = joinLine(["runtime", "pwd", "git"]);
  const l3 = joinLine(["tokens", "cache", "cost"]);

  const narrow = [l1, l2, l3]
    .filter((line) => visibleWidth(line) > 0)
    .map(fit);

  return hasBars ? [...narrow, truncateToWidth(line3, width)] : narrow;
};
