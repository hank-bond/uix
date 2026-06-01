// UIX cockpit — shared canvas addressing helpers.
//
// Canvas documents are addressed by keys, not filesystem paths. Keys are
// slash-namespaced lowercase slug segments. The custom protocol needs the full
// key to participate in the URL origin, so slash segments are reversed into
// host labels: reports/security-review -> security-review.reports.

export const CanvasProtocolScheme = "uix-canvas";

const canvasKeyPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

export function isCanvasKey(key: string): boolean {
  return canvasKeyPattern.test(key);
}

export const CanvasKeyDescription =
  "lowercase slug segments [a-z0-9-]+ optionally separated by /";

export function invalidCanvasKeyMessage(key: string): string {
  return `Invalid canvas key "${key}". Canvas keys must be ${CanvasKeyDescription}. Examples: main, reports/security-review.`;
}

export function assertCanvasKey(key: string): void {
  if (!isCanvasKey(key)) {
    throw new Error(invalidCanvasKeyMessage(key));
  }
}

export function canvasKeyToHost(key: string): string {
  assertCanvasKey(key);
  return key.split("/").reverse().join(".");
}

export function canvasHostToKey(host: string): string | null {
  if (!host) return null;
  const key = host.toLowerCase().split(".").reverse().join("/");
  return isCanvasKey(key) ? key : null;
}

export function canvasUrl(key: string, token?: number): string {
  const query = token === undefined ? "" : `?v=${token}`;
  return `${CanvasProtocolScheme}://${canvasKeyToHost(key)}/${query}`;
}
