import process from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AttachmentWebBindingTransport,
  Channels,
  parseAttachmentWebBindingSnapshot,
} from "./channel-transport";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn<(channel: string) => Promise<unknown>>(),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: electron,
}));

const snapshot = { revision: 0, workspaceId: "local", binding: "opaque-token" };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("process", { ...process, isMainFrame: true });
});
afterEach(() => vi.unstubAllGlobals());

async function readBridge(): Promise<AttachmentWebBindingTransport> {
  await import("./preload");
  const exposed = electron.exposeInMainWorld.mock.calls.find(
    ([name]) => name === "attachmentWebBinding",
  );
  if (!exposed) throw new Error("Binding bridge not exposed");
  return exposed[1] as AttachmentWebBindingTransport;
}

describe("Electron attachment binding preload", () => {
  it("validates bootstrap responses before providing them to the renderer", async () => {
    const bridge = await readBridge();
    electron.invoke.mockResolvedValueOnce(snapshot);
    const result = await bridge.read();
    expect(result).toEqual(snapshot);
    expect(result).not.toBe(snapshot);
    expect(Object.isFrozen(result)).toBe(true);
    expect(electron.invoke).toHaveBeenCalledWith(Channels.webBindingRead);
    electron.invoke.mockResolvedValueOnce({ ...snapshot, revision: -1 });
    await expect(bridge.read()).rejects.toThrow();
  });

  it("validates replacement messages before notifying and pairs listener cleanup", async () => {
    const bridge = await readBridge();
    const snapshotListener = vi.fn();
    using lifetime = new DisposableStack();
    lifetime.defer(bridge.subscribe(snapshotListener));
    const eventListener = electron.on.mock.calls.find(
      ([channel]) => channel === Channels.webBindingChanged,
    )?.[1] as ((event: unknown, value: unknown) => void) | undefined;
    if (!eventListener) throw new Error("Binding listener not registered");
    expect(() => {
      eventListener({}, { ...snapshot, revision: "1" });
    }).toThrow();
    expect(snapshotListener).not.toHaveBeenCalled();
    eventListener({}, { ...snapshot, revision: 1 });
    expect(snapshotListener).toHaveBeenCalledWith({ ...snapshot, revision: 1 });
    lifetime.dispose();
    expect(electron.off).toHaveBeenCalledWith(
      Channels.webBindingChanged,
      eventListener,
    );
  });

  it("does not provide either bridge to subframes", async () => {
    vi.stubGlobal("process", { ...process, isMainFrame: false });
    await import("./preload");
    expect(electron.exposeInMainWorld).not.toHaveBeenCalled();
  });
});

it.each([
  null,
  {},
  { ...snapshot, revision: NaN },
  { ...snapshot, revision: Infinity },
  { ...snapshot, revision: 0.5 },
  { ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
  { ...snapshot, workspaceId: "" },
  { ...snapshot, binding: "" },
  { ...snapshot, binding: 42 },
  { ...snapshot, unexpected: true },
])("rejects malformed binding control data: %j", (value) => {
  expect(() => parseAttachmentWebBindingSnapshot(value)).toThrow();
});
