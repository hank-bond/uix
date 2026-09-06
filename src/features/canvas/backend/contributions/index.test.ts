import { describe, expect, it } from "vitest";

import { createFeatureEventPublisher } from "@uix/api/channels";
import type {
  DocumentStore,
  DocumentStoreFactory,
  DocumentVersion,
} from "@uix/api/documents";
import type { AgentFeatureContext } from "@uix/api/feature";
import type { WebRouteHandler, WebRouteResponder } from "@uix/api/web-routes";

import { canvasFeature } from "./index";
import { parseCanvasKey } from "../../shared/addressing";
import type { CanvasDocumentRoute } from "../../shared/web-routes";

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

type CanvasDocumentHandler = WebRouteHandler<typeof CanvasDocumentRoute>;

const respond = ((status: 200, body: string) => ({
  status,
  content: "html-document",
  body,
})) as unknown as WebRouteResponder;

describe("canvas Agent factory", () => {
  it("creates independent buffers and callbacks over one document store", async () => {
    const documents = memoryDocuments();
    const workspace = canvasFeature.workspace?.(context(documents));
    const first = canvasFeature.agent?.(context(documents));
    const second = canvasFeature.agent?.(context(documents));
    if (!workspace || !first || !second) {
      throw new Error("Missing Canvas feature factory");
    }

    const firstChannel = first.channels?.[0];
    const secondChannel = second.channels?.[0];
    if (!firstChannel || !secondChannel) {
      throw new Error("Missing Canvas Agent channels");
    }
    const writeFirst = firstChannel.requests["writeback"].handler;
    expect(firstChannel.requests).not.toHaveProperty("read");
    expect(workspace.resources).toBeUndefined();
    const firstDocumentRoute = first.webRoutes?.[0];
    const secondDocumentRoute = second.webRoutes?.[0];
    if (!firstDocumentRoute || !secondDocumentRoute) {
      throw new Error("Missing Canvas web route");
    }
    const firstDocumentHandler =
      firstDocumentRoute.handler as unknown as CanvasDocumentHandler;
    const secondDocumentHandler =
      secondDocumentRoute.handler as unknown as CanvasDocumentHandler;
    if (!first.turnState || !second.turnState) {
      throw new Error("Missing Canvas turn state");
    }

    await writeFirst({ key: "main", html: "<p>first</p>" });

    const firstDocument = await firstDocumentHandler(
      {
        params: {},
        query: { key: parseCanvasKey("main") },
        signal: new AbortController().signal,
      },
      respond,
    );
    expect(firstDocument.body).toContain("first");
    expect(firstDocument.body).toContain("canvas:writeback");

    await expect(
      first.turnState.documents.createSnapshot(),
    ).resolves.toMatchObject({ "doc://canvas/main": "v1" });
    await expect(second.turnState.documents.createSnapshot()).resolves.toEqual(
      {},
    );
    const secondDocument = await secondDocumentHandler(
      {
        params: {},
        query: { key: parseCanvasKey("main") },
        signal: new AbortController().signal,
      },
      respond,
    );
    expect(secondDocument.body).not.toContain("first");
    expect(workspace.viewpointWebRouteContracts).toEqual([
      firstDocumentRoute.contract,
    ]);
    expect(firstDocumentRoute.contract).toBe(secondDocumentRoute.contract);
    expect(first.agentTools).not.toBe(second.agentTools);
    expect(first.agentContext).not.toBe(second.agentContext);

    first[Symbol.dispose]?.();
    second[Symbol.dispose]?.();
  });
});
