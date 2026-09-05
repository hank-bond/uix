import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Type } from "typebox";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ChannelContract } from "@uix/api/channels";
import {
  type FeatureWebRootUrl,
  parseFeatureWebRootUrl,
} from "@uix/api/feature-web-root-url";
import { defineWebRoute } from "@uix/api/web-routes";
import {
  type FeatureWebRouteProviderProps,
  useWebRouteClient,
  type WorkspaceClient,
  WorkspaceClientProvider,
} from "@uix/api/workspace";

import { ActionRegistryProvider } from "./action-context";
import { ActionRegistry } from "./action-registry";
import type { useFeatureWebRootUrl } from "./attachment-web-roots-observable";
import {
  AttachmentWebRootsObservableProvider,
  type AttachmentWebRootsSnapshot,
} from "./attachment-web-roots-observable";
import { createSurfaceChannelClients, SurfaceMount } from "./surface-host";

const contract = {
  requests: {
    ping: {
      requestSchema: Type.Void(),
      responseSchema: Type.Void(),
    },
  },
  events: {},
} as const satisfies ChannelContract;

function fakeWorkspaceClient(namespaces: readonly string[]): {
  workspace: WorkspaceClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(() => Promise.resolve(undefined));
  return {
    workspace: {
      workspaceId: "local",
      channelNamespaces: namespaces,
      request,
      subscribe: () => () => undefined,
    },
    request,
  };
}

const DocumentRoute = defineWebRoute({
  method: "GET",
  path: "/view",
  query: Type.Object({ key: Type.String() }),
  responses: { 200: { content: "html-document" } },
});

function RouteUrlProbe(): ReactElement {
  const route = useWebRouteClient(DocumentRoute);
  return createElement("output", null, route.toUrl({ query: { key: "main" } }));
}

describe("surface channel clients", () => {
  it("uses each declarative key as its contract namespace", async () => {
    const { workspace, request } = fakeWorkspaceClient(["agent", "canvas"]);
    const clients = createSurfaceChannelClients(workspace, {
      agent: contract,
      canvas: contract,
    });

    await clients["agent"].requests["ping"](undefined);
    await clients["canvas"].requests["ping"](undefined);

    expect(request).toHaveBeenNthCalledWith(1, "agent.ping", undefined);
    expect(request).toHaveBeenNthCalledWith(2, "canvas.ping", undefined);
  });

  it("rejects a namespace absent from the backend catalog", () => {
    const { workspace } = fakeWorkspaceClient(["canvas"]);

    expect(() =>
      createSurfaceChannelClients(workspace, { agent: contract }),
    ).toThrow("Channel namespace is unavailable: agent");
  });

  it("preserves the feature-root brand across the observable, hook, and provider", () => {
    expectTypeOf<
      ReturnType<AttachmentWebRootsSnapshot["toFeatureRootUrl"]>
    >().toEqualTypeOf<FeatureWebRootUrl>();
    expectTypeOf<ReturnType<typeof useFeatureWebRootUrl>>().toEqualTypeOf<
      FeatureWebRootUrl | undefined
    >();
    expectTypeOf<
      FeatureWebRouteProviderProps["featureRootUrl"]
    >().toEqualTypeOf<FeatureWebRootUrl | undefined>();
  });

  it("binds route clients to the mounted feature without feature-authored identity", () => {
    const { workspace } = fakeWorkspaceClient([]);
    const toFeatureRootUrl = vi.fn((featureId: string) =>
      parseFeatureWebRootUrl(
        `https://host.example/viewpoints/binding/${featureId}/`,
      ),
    );
    const rootsObservable = {
      getSnapshot: () => ({ toFeatureRootUrl }),
      subscribe: () => () => undefined,
    };
    const registry = new ActionRegistry({ shortcutPlatform: "other" });
    const mountedSurface = createElement(SurfaceMount, {
      entry: { featureId: "canvas", entry: "/features/canvas.ts" },
      surface: {
        name: "canvas",
        render: () => createElement(RouteUrlProbe),
      },
    });
    const markup = renderToStaticMarkup(
      createElement(AttachmentWebRootsObservableProvider, {
        observable: rootsObservable,
        children: createElement(WorkspaceClientProvider, {
          client: workspace,
          children: createElement(ActionRegistryProvider, {
            registry,
            children: mountedSurface,
          }),
        }),
      }),
    );

    expect(toFeatureRootUrl).toHaveBeenCalledExactlyOnceWith("canvas");
    expect(markup).toContain(
      "https://host.example/viewpoints/binding/canvas/view?key=main",
    );
  });
});
