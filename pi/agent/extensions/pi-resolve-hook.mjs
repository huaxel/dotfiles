const BASE = "/home/juan/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@earendil-works/pi-ai" || specifier === "@earendil-works/pi-ai/compat") {
    const file = specifier.endsWith("/compat") ? "/dist/compat.js" : "/dist/index.js";
    return nextResolve("file://" + BASE + "/node_modules/@earendil-works/pi-ai" + file, context);
  }
  if (specifier === "@earendil-works/pi-coding-agent") {
    return nextResolve("file://" + BASE + "/dist/index.js", context);
  }
  if (specifier === "@earendil-works/pi-tui") {
    return nextResolve("file://" + BASE + "/node_modules/@earendil-works/pi-tui/dist/index.js", context);
  }
  return nextResolve(specifier, context);
}
