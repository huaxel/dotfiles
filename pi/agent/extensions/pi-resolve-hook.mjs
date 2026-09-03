import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function piPackageRoot() {
  if (process.env.PI_TEST_PI_ROOT) return process.env.PI_TEST_PI_ROOT;

  try {
    const npmRoot = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (npmRoot) return path.join(npmRoot, "@earendil-works", "pi-coding-agent");
  } catch {
    // Keep the test hook usable in minimal environments; the override above
    // is preferred when Pi was installed by a non-npm package manager.
  }

  return path.join(
    os.homedir(),
    ".npm-global",
    "lib",
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
  );
}

const BASE = piPackageRoot();
const fileUrl = (...parts) => pathToFileURL(path.join(BASE, ...parts)).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@earendil-works/pi-ai" || specifier === "@earendil-works/pi-ai/compat") {
    const file = specifier.endsWith("/compat") ? ["dist", "compat.js"] : ["dist", "index.js"];
    return nextResolve(fileUrl("node_modules", "@earendil-works", "pi-ai", ...file), context);
  }
  if (specifier === "@earendil-works/pi-coding-agent") {
    return nextResolve(fileUrl("dist", "index.js"), context);
  }
  if (specifier === "@earendil-works/pi-tui") {
    return nextResolve(fileUrl("node_modules", "@earendil-works", "pi-tui", "dist", "index.js"), context);
  }
  return nextResolve(specifier, context);
}
