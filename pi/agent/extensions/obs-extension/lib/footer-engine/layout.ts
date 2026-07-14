import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { LayoutAssembler } from "./types.js";

export const defaultAssembler: LayoutAssembler = (segments, width, theme) => {
  const sep = " " + theme.fg("dim", "▸") + " ";

  const leftParts = [segments["modelThink"]].filter(Boolean);
  const rightParts = [
    segments["contextUsage"],
    segments["tokens"],
    segments["tps"],
    segments["cost"],
    segments["usageBars"],
  ].filter(Boolean);
  const middleParts = [segments["runtime"], segments["pwd"], segments["git"]].filter(Boolean);

  const leftStr = leftParts.join(sep);
  const rightStr = rightParts.join(sep);
  const middleStr = middleParts.join(sep);

  const singleLine = middleStr
    ? leftStr + sep + middleStr + sep + rightStr
    : leftStr + sep + rightStr;

  function padLine(text: string): string {
    const w = visibleWidth(text);
    if (w < width) return text + " ".repeat(width - w);
    return text;
  }

  // 1 — everything on one line
  if (visibleWidth(singleLine) <= width) {
    return [padLine(singleLine)];
  }

  // 2 — split into two groups
  const line1 = [segments["modelThink"], segments["pwd"], segments["git"]]
    .filter(Boolean).join(sep);
  const line2 = [
    segments["runtime"],
    segments["contextUsage"],
    segments["tokens"],
    segments["tps"],
    segments["cost"],
    segments["usageBars"],
  ].filter(Boolean).join(sep);

  if (visibleWidth(line1) <= width && visibleWidth(line2) <= width) {
    return [padLine(line1), padLine(line2)];
  }

  // 3 — three-line fallback for narrow terminals (mobile, split panes)
  const l1 = [segments["modelThink"], segments["git"]]
    .filter(Boolean).join(sep);
  const l2 = [segments["pwd"], segments["runtime"], segments["contextUsage"]]
    .filter(Boolean).join(sep);
  const l3 = [
    segments["tokens"],
    segments["tps"],
    segments["cost"],
    segments["usageBars"],
  ].filter(Boolean).join(sep);

  return [
    visibleWidth(l1) > width ? truncateToWidth(l1, width) : padLine(l1),
    visibleWidth(l2) > width ? truncateToWidth(l2, width) : padLine(l2),
    visibleWidth(l3) > width ? truncateToWidth(l3, width) : padLine(l3),
  ];
};
