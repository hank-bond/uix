// The preload channel transport surface exposed on `window.channels`.
import type { ChannelTransport } from "../shared/ipc";

declare global {
  interface Window {
    channels: ChannelTransport;
  }
}

export {};
