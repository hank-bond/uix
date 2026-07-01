// Declares the channel transport that the preload exposes on `window.channels`.
import type { ChannelTransport } from "../shared/ipc";

declare global {
  interface Window {
    channels: ChannelTransport;
  }
}

export {};
