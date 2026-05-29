// Declares the bridge that the preload exposes on `window.trellis`.
import type { TrellisBridge } from "../shared/ipc";

declare global {
  interface Window {
    trellis: TrellisBridge;
  }
}

export {};
