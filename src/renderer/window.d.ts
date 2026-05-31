// Declares the bridge that the preload exposes on `window.uix`.
import type { UIXBridge } from "../shared/ipc";

declare global {
  interface Window {
    uix: UIXBridge;
  }
}

export {};
