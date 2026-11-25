import { pathToFileURL } from "node:url";
const url = pathToFileURL("./node_modules/@juanbenjumea/pi-dynamic-footer/observability.ts").href;
const mod = await import(url);
console.log("exports:", Object.keys(mod));
