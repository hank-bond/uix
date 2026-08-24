// Canvas feature entry.
//
// The definition lives in backend/contributions. This root-level entry is
// what the manifest references, so surface refs and served CSS/assets
// resolve against the whole feature directory.

export { canvasFeature as feature } from "./backend/contributions";
