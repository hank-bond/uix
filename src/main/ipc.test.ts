import { beforeEach, describe, expect, it, vi } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import type {
  CanonicalRequest,
  CanonicalResponse,
  PreparedDispatch,
} from "@uix/runtime";

const electronMock = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: unknown, frame: unknown) => Promise<unknown>
  >(),
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.handle.mockImplementation(
      (
        channel: string,
        handler: (event: unknown, frame: unknown) => Promise<unknown>,
      ) => {
        electronMock.handlers.set(channel, handler);
      },
    ),
    removeHandler: electronMock.removeHandler.mockImplementation(
      (channel: string) => {
        electronMock.handlers.delete(channel);
      },
    ),
  },
}));

const wireLogMock = vi.hoisted(() => ({
  record: vi.fn(),
}));

vi.mock("./ipc-wire-log", () => ({
  recordWireCrossing: wireLogMock.record,
}));

import { handleCanonicalRequest } from "./ipc";

const PhysicalChannel = "uix:request";

beforeEach(() => {
  electronMock.handlers.clear();
  electronMock.handle.mockClear();
  electronMock.removeHandler.mockClear();
  wireLogMock.record.mockClear();
});

describe("canonical IPC request logging", () => {
  it("uses prepared contract policy for a successful crossing", async () => {
    const request: CanonicalRequest = {
      channel: toChannelCanonicalId("agent", "prompt"),
      payload: { text: "hello" },
    };
    const describeRequest = vi.fn(() => ({ kind: "prompt" }));
    const release = vi.fn();
    const dispatch: PreparedDispatch = {
      request,
      logOptions: { describeRequest },
      invoke: vi.fn<() => Promise<CanonicalResponse>>(() =>
        Promise.resolve({ ok: true, value: undefined }),
      ),
      [Symbol.dispose]: release,
    };
    const lifetime = handleCanonicalRequest(PhysicalChannel, () => dispatch);
    const handler = electronMock.handlers.get(PhysicalChannel);
    if (!handler) throw new Error("Canonical IPC handler was not registered");

    await expect(handler(undefined, request)).resolves.toBeUndefined();

    expect(wireLogMock.record).toHaveBeenCalledTimes(2);
    expect(wireLogMock.record.mock.calls[0]?.[1]).toBe("in:agent.prompt");
    expect(wireLogMock.record.mock.calls[0]?.[2]).toBe(request.payload);
    expect(wireLogMock.record.mock.calls[0]?.[3]).toEqual({
      describe: describeRequest,
    });
    expect(release).toHaveBeenCalledOnce();
    lifetime[Symbol.dispose]();
  });

  it("records a redacted inbound crossing when preparation fails", async () => {
    const secret = "secret-before-preparation";
    const frame = {
      channel: "agent.prompt",
      payload: { text: secret },
    };
    const lifetime = handleCanonicalRequest(PhysicalChannel, () => {
      throw new Error("Attachment is disposed");
    });
    const handler = electronMock.handlers.get(PhysicalChannel);
    if (!handler) throw new Error("Canonical IPC handler was not registered");

    await expect(handler(undefined, frame)).rejects.toThrow(
      "Attachment is disposed",
    );

    expect(wireLogMock.record).toHaveBeenCalledOnce();
    const crossing = wireLogMock.record.mock.calls[0];
    expect(crossing[1]).toBe("in:agent.prompt");
    const options = crossing[3] as {
      describe: (payload: unknown) => unknown;
    };
    const description = options.describe(frame);
    expect(description).toEqual({
      channel: "agent.prompt",
      redacted: "request payload unavailable before dispatch preparation",
    });
    expect(JSON.stringify(description)).not.toContain(secret);
    lifetime[Symbol.dispose]();
  });

  it("keeps malformed channel text out of the wire-log label", async () => {
    const frame = {
      channel: "agent.prompt\nspoofed-log-line",
      payload: { text: "secret" },
    };
    const lifetime = handleCanonicalRequest(PhysicalChannel, () => {
      throw new Error("Malformed request");
    });
    const handler = electronMock.handlers.get(PhysicalChannel);
    if (!handler) throw new Error("Canonical IPC handler was not registered");

    await expect(handler(undefined, frame)).rejects.toThrow(
      "Malformed request",
    );

    const crossing = wireLogMock.record.mock.calls[0];
    expect(crossing[1]).toBe("in:uix:request:invalid");
    const options = crossing[3] as {
      describe: (payload: unknown) => unknown;
    };
    expect(options.describe(frame)).toEqual({
      channel: "invalid",
      redacted: "request payload unavailable before dispatch preparation",
    });
    lifetime[Symbol.dispose]();
  });
});
