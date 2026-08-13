// Isolation proof: two real workspace runtimes in one process with
// overlapping feature, channel, resource, and settings ids.
//
// Both workspaces load the same fixture feature (identical feature id, channel
// canonical id, resource canonical id, surface feature id), each over its own
// in-memory channel and resource transports. The scenarios exercise feature
// activation, per-workspace settings, document storage isolation, canonical
// dispatch with host-stamped attachment context, resource serving, surface
// composition, independent reload, scoped runtime events, and disposal
// isolation. No Electron, WebSocket, HTTP, or Pi services are involved. The
// runtime is proven against fake host dependencies, so failures reveal
// runtime isolation rather than platform behavior.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import {
  encodeResourceUrl,
  normalizeResourceRoute,
  ResourceProtocolScheme,
} from "@uix/api/resource-routes";
import type { RuntimeEvent } from "@uix/runtime";
import type { WorkspaceRuntimeDependencies } from "@uix/runtime";
import {
  createWorkspaceRuntime,
  toBranchId,
  toSessionId,
  toWorkspaceId,
} from "@uix/runtime";

import type { Workspace } from "./roots";

const apiModuleDir = join(__dirname, "../../api/src");

/** The fixture feature both workspaces load: identical ids everywhere. */
const fixtureFeature = `
import { Type } from "typebox";

import type { ChannelContract } from "@uix/api/channels";
import { defineFeature } from "@uix/api/feature";
import { normalizeResourceRoute } from "@uix/api/resource-routes";
import { defineSettings } from "@uix/api/settings";

const contract = {
  feature: "echo",
  requests: {
    ping: { requestSchema: Type.Object({}), responseSchema: Type.String() },
    read_doc: {
      requestSchema: Type.Object({}),
      responseSchema: Type.Union([Type.String(), Type.Null()]),
    },
    write_doc: {
      requestSchema: Type.Object({ content: Type.String() }),
      responseSchema: Type.Void(),
    },
  },
  events: {},
} as const satisfies ChannelContract;

export const feature = defineFeature({
  id: "echo",
  settings: defineSettings({
    schema: Type.Object({ greeting: Type.String() }),
    default: { greeting: "hello" },
  }),
  contribute(ctx) {
    const docs = ctx.documents.createStore({ namespace: "echo" });
    return {
      channels: [
        {
          feature: "echo",
          requests: {
            ping: {
              requestSchema: Type.Object({}),
              responseSchema: Type.String(),
              handler: () => ctx.settings.get("greeting") ?? "no-greeting",
            },
            read_doc: {
              requestSchema: Type.Object({}),
              responseSchema: Type.Union([Type.String(), Type.Null()]),
              handler: () => docs.getCurrent("notes"),
            },
            write_doc: {
              requestSchema: Type.Object({ content: Type.String() }),
              responseSchema: Type.Void(),
              handler: async ({ content }) => {
                await docs.setCurrent("notes", content);
              },
            },
          },
          events: {},
        },
      ],
      resources: [
        {
          name: "greet",
          route: normalizeResourceRoute({ path: "/", origin: "feature" }),
          handler: () =>
            new Response(ctx.settings.get("greeting") ?? "no-greeting"),
        },
      ],
      surfaces: ["./surface.tsx"],
    };
  },
});
`;

const fixtureSurface = `
import { defineSurface } from "@uix/api/workspace";

export const surface = defineSurface({
  name: "echo",
  render: () => null,
});
`;

interface FakeTransports {
  dependencies: WorkspaceRuntimeDependencies;
  resourceHandlers: Map<
    string,
    (request: Request) => Response | Promise<Response>
  >;
  published: Array<{ channel: string; payload: unknown }>;
}

function fakeTransports(): FakeTransports {
  const resourceHandlers = new Map<
    string,
    (request: Request) => Response | Promise<Response>
  >();
  const published: Array<{ channel: string; payload: unknown }> = [];
  return {
    dependencies: {
      channelTransport: {
        transportRegistrar: () => ({
          [Symbol.dispose]() {},
        }),
        publish: (channel, payload) => {
          published.push({ channel, payload });
        },
      },
      resourceTransport: (scheme, handler) => {
        resourceHandlers.set(scheme, handler);
        return {
          [Symbol.dispose]() {
            resourceHandlers.delete(scheme);
          },
        };
      },
      openExternal: () => {},
    },
    resourceHandlers,
    published,
  };
}

/** A temp workspace root plus its manifest referencing the shared fixture. */
async function makeWorkspace(
  name: string,
  fixtureDir: string,
  greeting: string,
): Promise<Workspace> {
  const dir = await mkdtemp(join(tmpdir(), `iso-${name}-`));
  await writeFile(
    join(dir, "uix.workspace.json"),
    JSON.stringify(
      {
        name,
        features: [
          {
            entry: join(fixtureDir, "echo.ts"),
            settings: { greeting },
          },
        ],
      },
      null,
      2,
    ),
  );
  return {
    stateRoot: dir,
    agentCwd: dir,
    manifestPath: join(dir, "uix.workspace.json"),
  };
}

async function writeFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "iso-fixture-"));
  await writeFile(join(dir, "echo.ts"), fixtureFeature);
  await writeFile(join(dir, "surface.tsx"), fixtureSurface);
  return dir;
}

function loadedEventCount(events: RuntimeEvent[]): number {
  return events.filter((event) => event.id.startsWith("composition_loaded"))
    .length;
}

describe("workspace runtime isolation", () => {
  it("runs two workspaces with duplicate ids without cross-talk", async () => {
    const fixtureDir = await writeFixture();
    const workspaceA = await makeWorkspace(
      "workspace-a",
      fixtureDir,
      "hello-A",
    );
    const workspaceB = await makeWorkspace(
      "workspace-b",
      fixtureDir,
      "hello-B",
    );
    const transportsA = fakeTransports();
    const transportsB = fakeTransports();

    const runtimeA = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("ws-a"),
      workspace: workspaceA,
      piProfileDir: join(workspaceA.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: transportsA.dependencies,
    });
    const runtimeB = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("ws-b"),
      workspace: workspaceB,
      piProfileDir: join(workspaceB.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: transportsB.dependencies,
    });

    const eventsA: RuntimeEvent[] = [];
    const eventsB: RuntimeEvent[] = [];
    runtimeA.onEvent((event) => eventsA.push(event));
    runtimeB.onEvent((event) => eventsB.push(event));

    // Both workspaces activate the same feature id from the same entry.
    const activationA = await runtimeA.load();
    const activationB = await runtimeB.load();
    expect(activationA.activated.map((f) => f.id)).toEqual(["echo"]);
    expect(activationB.activated.map((f) => f.id)).toEqual(["echo"]);
    expect(activationA.workspaceName).toBe("workspace-a");
    expect(activationB.workspaceName).toBe("workspace-b");

    // Composition events are scoped per runtime: A's load never reached B.
    expect(loadedEventCount(eventsA)).toBe(1);
    expect(loadedEventCount(eventsB)).toBe(1);
    expect(eventsA.every((event) => event.scope.kind === "workspace")).toBe(
      true,
    );

    // A workspace-only route resolves its fallback inside the runtime and
    // returns an attachment with the accepted durable session identity.
    const fallbackA = await runtimeA.createAttachment();
    expect(fallbackA.sessionId).not.toBe("");
    await fallbackA.dispose();

    // Explicit attachments bind duplicate session ids unchanged. Dispatch is
    // per-workspace.
    const attachA = await runtimeA.createAttachment({
      sessionId: toSessionId("s1"),
    });
    const attachB = await runtimeB.createAttachment({
      sessionId: toSessionId("s1"),
    });
    await expect(
      runtimeA.createAttachment({
        sessionId: toSessionId("s1"),
        branchId: toBranchId("branch-1"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    await expect(
      attachA.retarget({
        sessionId: toSessionId("s1"),
        branchId: toBranchId("branch-1"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    expect(attachA.sessionId).toBe(toSessionId("s1"));
    // The same canonical channel id resolves per-workspace behavior: each
    // feature's handler reads its own persisted greeting setting.
    const ping = toChannelCanonicalId("echo", "ping");
    expect(await attachA.dispatch({ channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A",
    });
    expect(await attachB.dispatch({ channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-B",
    });

    // Document stores are rooted per workspace: A's writes never reach B.
    const writeDoc = toChannelCanonicalId("echo", "write_doc");
    const readDoc = toChannelCanonicalId("echo", "read_doc");
    await attachA.dispatch({
      channel: writeDoc,
      payload: { content: "a-notes" },
    });
    expect(await attachA.dispatch({ channel: readDoc, payload: {} })).toEqual({
      ok: true,
      value: "a-notes",
    });
    expect(await attachB.dispatch({ channel: readDoc, payload: {} })).toEqual({
      ok: true,
      value: null,
    });

    // The substrate settings channel answers per workspace scope.
    const getSetting = toChannelCanonicalId("uix", "get_setting");
    expect(
      await attachA.dispatch({
        channel: getSetting,
        payload: { featureId: "echo", key: "greeting" },
      }),
    ).toEqual({ ok: true, value: "hello-A" });
    expect(
      await attachB.dispatch({
        channel: getSetting,
        payload: { featureId: "echo", key: "greeting" },
      }),
    ).toEqual({ ok: true, value: "hello-B" });

    // The same resource route serves each workspace's own handler.
    const route = normalizeResourceRoute({ path: "/", origin: "feature" });
    const urlA = encodeResourceUrl(route, {
      featureId: "echo",
      name: "greet",
      workspaceId: "ws-a",
    });
    const urlB = encodeResourceUrl(route, {
      featureId: "echo",
      name: "greet",
      workspaceId: "ws-b",
    });
    const responseA = await transportsA.resourceHandlers.get(
      ResourceProtocolScheme,
    )?.(new Request(urlA));
    const responseB = await transportsB.resourceHandlers.get(
      ResourceProtocolScheme,
    )?.(new Request(urlB));
    expect(await responseA?.text()).toBe("hello-A");
    expect(await responseB?.text()).toBe("hello-B");

    // Surface composition: both serve the same feature id, built per runtime.
    const surfaces = toChannelCanonicalId("uix", "surfaces");
    const surfacesA = await attachA.dispatch({
      channel: surfaces,
      payload: undefined,
    });
    const surfacesB = await attachB.dispatch({
      channel: surfaces,
      payload: undefined,
    });
    expect(surfacesA).toMatchObject({ ok: true });
    expect(surfacesB).toMatchObject({ ok: true });
    if (!surfacesA.ok || !surfacesB.ok) {
      throw new Error("Surface composition request failed");
    }
    const surfacesValueA = surfacesA.value as {
      surfaces: Array<{ featureId: string; url: string }>;
      manifestFound: boolean;
    };
    const surfacesValueB = surfacesB.value as {
      surfaces: Array<{ featureId: string; url: string }>;
      manifestFound: boolean;
    };
    expect(surfacesValueA.surfaces).toHaveLength(1);
    expect(surfacesValueB.surfaces).toHaveLength(1);
    expect(surfacesValueA.surfaces[0].featureId).toBe("echo");
    expect(surfacesValueB.surfaces[0].featureId).toBe("echo");
    expect(surfacesValueA.manifestFound).toBe(true);
    expect(surfacesValueB.manifestFound).toBe(true);
    expect(surfacesValueA.surfaces[0].url).not.toBe(
      surfacesValueB.surfaces[0].url,
    );

    // Reload one workspace: it picks up the new greeting, the other keeps its own.
    await writeFile(
      workspaceA.manifestPath,
      JSON.stringify(
        {
          name: "workspace-a",
          features: [
            {
              entry: join(fixtureDir, "echo.ts"),
              settings: { greeting: "hello-A2" },
            },
          ],
        },
        null,
        2,
      ),
    );
    const reloadA = await runtimeA.reload();
    expect(reloadA.featuresActivated).toBe(1);
    expect(reloadA.featuresFailed).toBe(0);
    expect(await attachA.dispatch({ channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A2",
    });
    expect(await attachB.dispatch({ channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-B",
    });

    // Disposing one runtime removes only its state and routes.
    await runtimeA.dispose();
    expect(await attachA.dispatch({ channel: ping, payload: {} })).toEqual({
      ok: false,
      error: { code: "disposed", message: "Attachment is disposed" },
    });
    expect(await attachB.dispatch({ channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-B",
    });
    expect(
      await transportsB.resourceHandlers.get(ResourceProtocolScheme)?.(
        new Request(urlB),
      ),
    ).toBeDefined();

    await runtimeB.dispose();
  });
});
