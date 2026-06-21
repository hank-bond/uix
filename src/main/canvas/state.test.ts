import { describe, expect, it } from "vitest";

import type { StateContribution, StateRegistry } from "../state/registry";

import { CanvasDocumentBuffer } from "./document-buffer";
import type { ContentStore, ContentVersion } from "./content-store";
import { registerCanvasState } from "./state";

function memoryStore(initial: Record<string, string> = {}): ContentStore {
  const latest = new Map<string, string>(Object.entries(initial));
  const versions = new Map<string, ContentVersion>();

  return {
    getCurrent: (docId) => Promise.resolve(latest.get(docId) ?? null),
    setCurrent: (docId, content) => {
      latest.set(docId, content);
      return Promise.resolve();
    },
    snapshotCurrent: (docId, meta) => {
      const version: ContentVersion<typeof meta> = {
        id: `v${versions.size + 1}`,
        docId,
        content: latest.get(docId) ?? "",
        meta,
        createdAt: new Date(0).toISOString(),
      };
      versions.set(`${docId}:${version.id}`, version);
      return Promise.resolve(version);
    },
    getVersion<TMeta>(docId: string, versionId: string) {
      return Promise.resolve(
        (versions.get(`${docId}:${versionId}`) as
          | ContentVersion<TMeta>
          | undefined) ?? null,
      );
    },
  };
}

function captureCanvasState(opts: {
  store?: ContentStore;
  openCanvasKeys?: readonly string[];
  agentChangedCanvasKeys?: Set<string>;
}) {
  let contribution: StateContribution | undefined;
  const state: StateRegistry = {
    register(next) {
      contribution = next;
      return { [Symbol.dispose]: () => {} };
    },
  };

  const agentChangedCanvasKeys = opts.agentChangedCanvasKeys ?? new Set();
  registerCanvasState(
    state,
    new CanvasDocumentBuffer(opts.store ?? memoryStore()),
    opts.openCanvasKeys ?? [],
    agentChangedCanvasKeys,
  );

  if (!contribution) throw new Error("Canvas state was not registered");
  return { contribution, agentChangedCanvasKeys };
}

describe("registerCanvasState", () => {
  it("registers the canvas state contribution id", () => {
    const { contribution } = captureCanvasState({});

    expect(contribution.id).toBe("canvas");
  });

  it("snapshots open canvases on user submit", async () => {
    const store = memoryStore({ main: "<p>hello</p>" });
    const { contribution } = captureCanvasState({
      store,
      openCanvasKeys: ["main"],
    });

    await expect(
      contribution.prepareUserSubmitState?.({ cwd: "/work" }),
    ).resolves.toEqual({
      state: { "doc://canvas/main": "v1" },
    });
  });

  it("returns undefined on user submit when no canvases are open", async () => {
    const { contribution } = captureCanvasState({ openCanvasKeys: [] });

    await expect(
      contribution.prepareUserSubmitState?.({ cwd: "/work" }),
    ).resolves.toBeUndefined();
  });

  it("does not snapshot agent-end state when the agent changed no canvases", async () => {
    const { contribution } = captureCanvasState({
      store: memoryStore({ main: "<p>hello</p>" }),
      openCanvasKeys: ["main"],
    });

    await expect(
      contribution.prepareAgentEndState?.({ cwd: "/work" }),
    ).resolves.toBeUndefined();
  });

  it("snapshots open and agent-changed canvases on agent end", async () => {
    const store = memoryStore({
      main: "<p>open</p>",
      "reports/security": "<p>changed</p>",
    });
    const { contribution } = captureCanvasState({
      store,
      openCanvasKeys: ["main"],
      agentChangedCanvasKeys: new Set(["reports/security"]),
    });

    await expect(
      contribution.prepareAgentEndState?.({ cwd: "/work" }),
    ).resolves.toEqual({
      state: {
        "doc://canvas/main": "v1",
        "doc://canvas/reports/security": "v2",
      },
    });
  });

  it("clears the agent-changed canvas set after snapshotting", async () => {
    const agentChangedCanvasKeys = new Set(["scratch"]);
    const { contribution } = captureCanvasState({
      store: memoryStore({ scratch: "<p>changed</p>" }),
      openCanvasKeys: [],
      agentChangedCanvasKeys,
    });

    await contribution.prepareAgentEndState?.({ cwd: "/work" });

    expect(agentChangedCanvasKeys.size).toBe(0);
    await expect(
      contribution.prepareAgentEndState?.({ cwd: "/work" }),
    ).resolves.toBeUndefined();
  });
});
