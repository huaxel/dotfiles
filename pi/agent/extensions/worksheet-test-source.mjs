import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Keep regression coverage while the .disabled suffix prevents Pi discovery.
// This source has only node: runtime imports, so a data URL needs no resolver.
const source = readFileSync(new URL("./worksheet-loop.ts.disabled", import.meta.url), "utf8");
const javascript = stripTypeScriptTypes(source);
export const worksheet = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
