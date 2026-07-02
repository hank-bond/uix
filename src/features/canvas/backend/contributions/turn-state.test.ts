import { describe, expect, it } from "vitest";

import { createFeatureEventPublisher } from "@uix/api/channels";

import { CanvasDocumentBuffer } from "../document-buffer";
import { canvasChannels } from "../../shared/channels";
import type { CanvasContext } from "../context";
import type { DocumentStore, DocumentVersion } from "@uix/api/documents";
import type { FeatureContext } from "@uix/api/feature";
import type { TurnStatePreparationContext } from "@uix/api/turn-state";

import { createCanvasTurnStateContributions } from "./turn-state";

function prepCtx(): TurnStatePreparationContext {
  return {
    cwd: "/work",
    turnState: () => undefined,
    turnStates: () => [],
  };
}

function memoryStore(initial: Record<string, string> = {}): DocumentStore {
  const latest = new Map<string, string>(Object.entries(initial));
  const versions = new Map<string, DocumentVersion>();

  return {
    getCurrent: (docId) => Promise.resolve(latest.get(docId) ?? null),
    setCurrent: (docId, content) => {
      latest.set(docId, content);
      return Promise.resolve();
    },
    snapshotCurrent: (docId, meta) => {
      const version: DocumentVersion<typeof meta> = {
        id: `v${versions.size + 1}`,
        documentId: docId,
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
          | DocumentVersion<TMeta>
          | undefined) ?? null,
      );
    },
  };
}

function captureCanvasState(opts: {
  store?: DocumentStore;
  openCanvasKeys?: readonly string[];
  agentChangedCanvasKeys?: Set<string>;
}) {
  const agentChangedCanvasKeys = opts.agentChangedCanvasKeys ?? new Set();
  const store = opts.store ?? memoryStore();
  const base: FeatureContext = {
    documents: { createStore: () => store },
    channels: {
      createPublisher: (contract) =>
        createFeatureEventPublisher(() => undefined, contract),
    },
    log: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  const ctx: CanvasContext = {
    ...base,
    store,
    buffer: new CanvasDocumentBuffer(store),
    events: base.channels.createPublisher(canvasChannels),
    openCanvasKeys: opts.openCanvasKeys ?? [],
    agentChangedCanvasKeys,
  };
  const [contribution] = createCanvasTurnStateContributions(ctx);

  if (!contribution) throw new Error("Canvas state was not created");
  return { contribution, agentChangedCanvasKeys };
}

describe("createCanvasTurnStateContributions", () => {
  it("snapshots open canvases on user submit", async () => {
    const store = memoryStore({ main: "<p>hello</p>" });
    const { contribution } = captureCanvasState({
      store,
      openCanvasKeys: ["main"],
    });

    await expect(
      contribution.prepareUserSubmitState?.(prepCtx()),
    ).resolves.toEqual({
      state: { "doc://canvas/main": "v1" },
    });
  });

  it("returns undefined on user submit when no canvases are open", async () => {
    const { contribution } = captureCanvasState({ openCanvasKeys: [] });

    await expect(
      contribution.prepareUserSubmitState?.(prepCtx()),
    ).resolves.toBeUndefined();
  });

  it("does not snapshot agent-end state when the agent changed no canvases", async () => {
    const { contribution } = captureCanvasState({
      store: memoryStore({ main: "<p>hello</p>" }),
      openCanvasKeys: ["main"],
    });

    await expect(
      contribution.prepareAgentEndState?.(prepCtx()),
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
      contribution.prepareAgentEndState?.(prepCtx()),
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

    await contribution.prepareAgentEndState?.(prepCtx());

    expect(agentChangedCanvasKeys.size).toBe(0);
    await expect(
      contribution.prepareAgentEndState?.(prepCtx()),
    ).resolves.toBeUndefined();
  });
});
