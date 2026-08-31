import { describe, expect, it, vi } from "vitest";

import type { ChannelTransport } from "#shared/ipc";

import { createElectronActionInvocationSource } from "./electron-action-invocation-source";

describe("createElectronActionInvocationSource", () => {
  it("validates Electron menu action ids before forwarding them", () => {
    let receive: ((payload: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(
      (_channel: string, handler: (payload: unknown) => void): (() => void) => {
        receive = handler;
        return unsubscribe;
      },
    );
    const transport: ChannelTransport = {
      request: vi.fn(),
      subscribe,
    };
    const handler = vi.fn();
    const source = createElectronActionInvocationSource(transport);

    expect(source.subscribe(handler)).toBe(unsubscribe);
    receive?.("uix.reload");
    expect(handler).toHaveBeenCalledWith("uix.reload");
    expect(() => receive?.("not an action id")).toThrow();
  });
});
