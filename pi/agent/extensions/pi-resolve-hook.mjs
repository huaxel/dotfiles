import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function piPackageRoot() {
  if (process.env.PI_TEST_PI_ROOT) return process.env.PI_TEST_PI_ROOT;

  // Prefer this checkout's managed installer over an unrelated global Pi.
  try {
    const install = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "install");
    const version = readFileSync(path.join(install, "current-version"), "utf8").trim();
    if (/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) {
      const managed = path.join(install, "releases", version, "node_modules", "@earendil-works", "pi-coding-agent");
      if (existsSync(path.join(managed, "package.json"))) return managed;
    }
  } catch { /* Fall back for non-managed installs. */ }

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
const fromPi = createRequire(path.join(BASE, "package.json"));
// Resolve before registerHooks installs this function; resolving inside a hook
// would recursively invoke it on flat Pi installations.
const hostEntries = new Map(
  ["@earendil-works/pi-ai", "@earendil-works/pi-ai/compat", "@earendil-works/pi-tui"].map((name) => {
    // Pi's exports may be import-only, so CJS require.resolve(name) cannot
    // resolve them. Search Node's dependency roots for the documented entry.
    const packageName = name.endsWith("/compat") ? "@earendil-works/pi-ai" : name;
    const entryName = name.endsWith("/compat") ? "compat.js" : "index.js";
    const entry = (fromPi.resolve.paths(packageName) ?? []).map(root => path.join(root, packageName, "dist", entryName)).find(existsSync);
    return [name, entry ? pathToFileURL(entry).href : null];
  }),
);

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@earendil-works/pi-ai" || specifier === "@earendil-works/pi-ai/compat") {
    const entry = hostEntries.get(specifier);
    if (entry) return nextResolve(entry, context);
    const file = specifier.endsWith("/compat") ? ["dist", "compat.js"] : ["dist", "index.js"];
    return nextResolve(fileUrl("node_modules", "@earendil-works", "pi-ai", ...file), context);
  }
  if (specifier === "@earendil-works/pi-coding-agent") {
    return nextResolve(fileUrl("dist", "index.js"), context);
  }
  if (specifier === "@earendil-works/pi-tui") {
    const entry = hostEntries.get(specifier);
    if (entry) return nextResolve(entry, context);
    return nextResolve(fileUrl("node_modules", "@earendil-works", "pi-tui", "dist", "index.js"), context);
  }
  return nextResolve(specifier, context);
}
