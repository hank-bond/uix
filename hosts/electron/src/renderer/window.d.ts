// Host communication capabilities provided by preload to main-frame pages.
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
