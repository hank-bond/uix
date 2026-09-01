// The preload channel transport surface exposed on `window.channels`.
import type { ChannelTransport } from "../channel-transport";

declare global {
  interface Window {
    channels: ChannelTransport;
  }
}

export {};
