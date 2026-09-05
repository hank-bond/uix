// The host-only channel and attachment-binding bridges exposed by preload.
import type {
  AttachmentWebBindingTransport,
  ChannelTransport,
} from "../channel-transport";

declare global {
  interface Window {
    channels: ChannelTransport;
    attachmentWebBinding: AttachmentWebBindingTransport;
  }
}

export {};
