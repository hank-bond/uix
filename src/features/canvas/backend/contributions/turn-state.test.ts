import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { createFeatureEventPublisher } from "@uix/api/channels";
import type { DocumentStore, DocumentVersion } from "@uix/api/documents";
import type { FeatureContext } from "@uix/api/feature";
import type { TurnStateCellDefinition } from "@uix/api/turn-state";
import {
  createTurnStateProjector,
  registerTurnStateContributions,
  restoreTurnStateCellsAsOfLeaf,
  toTurnStateRegistrySnapshot,
  TurnStateRegistry,
} from "../../../../main/turn-state/registry";

import { canvasChannels } from "../../shared/channels";
import { CanvasDocumentBuffer } from "../document-buffer";
import type { CanvasContext } from "../context";

import { createCanvasTurnStateContributions } from "./turn-state";

function memoryStore(initial: Record<string, string> = {}): DocumentStore {
  const latest = new Map<string, string>(Object.entries(initial));
  const versions = new Map<string, DocumentVersion>();

  return {
    getCurrent: (docId) => Promise.resolve(latest.get(docId) ?? null),
    setCurrent: (docId, content) => {
      latest.set(docId, content);
      return Promise.resolve();
    },
    createSnapshot: (docId, meta) => {
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

async function restoreCanvasDocuments(
  contribution: TurnStateCellDefinition,
  documents?: unknown,
): Promise<void> {
  const turnState = new TurnStateRegistry();
  registerTurnStateContributions(turnState, "canvas", {
    documents: contribution,
  });
  const registrySnapshot = toTurnStateRegistrySnapshot(turnState);
  const projector = createTurnStateProjector(registrySnapshot);
  if (documents !== undefined) {
    projector.projectEntry({
      id: "turn-state",
      parentId: undefined,
      timestamp: new Date(0).toISOString(),
      type: "custom",
      customType: "uix.turn-state",
      data: { state: { "canvas.documents": documents } },
    } as unknown as SessionEntry);
  }
  await expect(
    restoreTurnStateCellsAsOfLeaf(registrySnapshot, projector.deriveAsOfLeaf()),
  ).resolves.toEqual({ failures: [] });
}

function captureCanvasState(store = memoryStore()) {
  const base: FeatureContext = {
    documents: { createStore: () => store },
    settings: {
      get: () => undefined,
      set: () => {},
      onChange: () => () => {},
    },
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
  const buffer = new CanvasDocumentBuffer(store);
  const ctx: CanvasContext = {
    ...base,
    store,
    buffer,
    events: base.channels.createPublisher(canvasChannels),
  };
  const contribution = createCanvasTurnStateContributions(ctx).documents;

  if (!contribution) throw new Error("Canvas documents state was not created");
  return { contribution, buffer, store };
}

describe("createCanvasTurnStateContributions", () => {
  it("creates a snapshot of every document loaded into the canvas working buffer", async () => {
    const { contribution, buffer } = captureCanvasState(
      memoryStore({ main: "<p>hello</p>" }),
    );
    await buffer.read("main");
    await buffer.write("reports/security", "<p>changed</p>");

    await expect(contribution.createSnapshot()).resolves.toEqual({
      "doc://canvas/main": "v1",
      "doc://canvas/reports/security": "v2",
    });
  });

  it("does not create snapshots merely because documents exist in the store", async () => {
    const { contribution } = captureCanvasState(
      memoryStore({ main: "<p>hello</p>" }),
    );

    await expect(contribution.createSnapshot()).resolves.toEqual({});
  });

  it("includes a human writeback in the working document set", async () => {
    const { contribution, buffer } = captureCanvasState();
    await buffer.writeback("notes", "<p>human edit</p>");

    await expect(contribution.createSnapshot()).resolves.toEqual({
      "doc://canvas/notes": "v1",
    });
  });

  it("restores document content and exact anchor state from version refs", async () => {
    const { contribution, buffer, store } = captureCanvasState(
      memoryStore({ main: "<p>hello</p>" }),
    );
    const anchoredBefore = await buffer.read("main");
    const state = await contribution.createSnapshot();
    await buffer.write("main", "<p>changed</p>");

    await restoreCanvasDocuments(contribution, state);

    expect(await store.getCurrent("main")).toBe(
      "<html><head></head><body><p>hello</p></body></html>",
    );
    expect(await buffer.read("main")).toEqual(anchoredBefore);
  });

  it("resets loaded documents when the selected branch has no documents cell", async () => {
    const { contribution, buffer, store } = captureCanvasState(
      memoryStore({ main: "<p>source session</p>" }),
    );
    await buffer.read("main");

    await restoreCanvasDocuments(contribution);

    expect(await store.getCurrent("main")).toBe("");
  });
});
