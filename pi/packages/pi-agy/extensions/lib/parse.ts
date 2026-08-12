/** Parse agy --output-format json responses; fall back to raw on schema drift. */
export function parseJsonResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return parsed.response ?? raw;
  } catch {
    return raw;
  }
}
