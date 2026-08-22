import { describe, expect, it } from "vitest";

import { createFeatureEventPublisher } from "@uix/api/channels";
import type {
  DocumentStore,
  DocumentStoreFactory,
  DocumentVersion,
} from "@uix/api/documents";
import type { AgentFeatureContext } from "@uix/api/feature";

import { canvasFeature } from "./index";

function memoryDocuments(): DocumentStoreFactory {
  const versions = new Map<string, DocumentVersion>();
  const store: DocumentStore = {
    getCurrent: () => Promise.resolve(null),
    setCurrent: () => Promise.resolve(),
    createSnapshot<TMeta>(documentId: string, content: string, meta: TMeta) {
      const version: DocumentVersion<TMeta> = {
        id: `v${String(versions.size + 1)}`,
        documentId,
        content,
        meta,
        createdAt: new Date(0).toISOString(),
      };
      versions.set(`${documentId}:${version.id}`, version);
      return Promise.resolve(version);
    },
    getVersion<TMeta>(documentId: string, versionId: string) {
      return Promise.resolve(
        (versions.get(`${documentId}:${versionId}`) as
          | DocumentVersion<TMeta>
          | undefined) ?? null,
      );
    },
  };
  return { createStore: () => store };
}

function context(documents: DocumentStoreFactory): AgentFeatureContext {
  return {
    documents,
    settings: {
      get: () => undefined,
      set: () => undefined,
      onChange: () => () => undefined,
    },
    channels: {
      createPublisher: (contract) =>
        createFeatureEventPublisher(() => undefined, contract),
    },
    log: {
      trace: () => undefined,
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };
}

describe("canvas Agent factory", () => {
  it("creates independent buffers and callbacks over one document store", async () => {
    const documents = memoryDocuments();
    const first = canvasFeature.agent?.(context(documents));
    const second = canvasFeature.agent?.(context(documents));
    if (!first || !second) throw new Error("Missing Canvas Agent factory");

    const firstChannel = first.channels?.[0];
    const secondChannel = second.channels?.[0];
    if (!firstChannel || !secondChannel) {
      throw new Error("Missing Canvas Agent channels");
    }
    const writeFirst = firstChannel.requests["writeback"].handler;
    const readFirst = firstChannel.requests["read"].handler;
    const readSecond = secondChannel.requests["read"].handler;
    if (!first.turnState || !second.turnState) {
      throw new Error("Missing Canvas turn state");
    }

    await writeFirst({ key: "main", html: "<p>first</p>" });

    await expect(readFirst({ key: "main" })).resolves.toContain("first");
    await expect(
      first.turnState.documents.createSnapshot(),
    ).resolves.toMatchObject({ "doc://canvas/main": "v1" });
    await expect(second.turnState.documents.createSnapshot()).resolves.toEqual(
      {},
    );
    await expect(readSecond({ key: "main" })).resolves.not.toContain("first");
    expect(first.agentTools).not.toBe(second.agentTools);
    expect(first.agentContext).not.toBe(second.agentContext);

    first[Symbol.dispose]?.();
    second[Symbol.dispose]?.();
  });
});
