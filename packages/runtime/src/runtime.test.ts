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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import {
  encodeResourceUrl,
  normalizeResourceRoute,
} from "@uix/api/resource-routes";
import type {
  Attachment,
  AttachmentAdmission,
  CanonicalRequest,
  CanonicalResponse,
  RuntimeEvent,
  SessionTarget,
  ViewpointWebRequest,
} from "@uix/runtime";
import type { WorkspaceRuntimeDependencies } from "@uix/runtime";
import {
  createWorkspaceRuntime,
  toBranchId,
  toWorkspaceId,
} from "@uix/runtime";

import type {
  ContentRequest,
  ContentTransportRegistrar,
} from "./content-transport";
import { disposable } from "./lifecycle";
import type { Workspace } from "./workspace-roots";

const apiModuleDir = join(__dirname, "../../api/src");
const reloadControlSymbol = Symbol.for("uix.runtime.test.reload-control");
interface ReloadControl {
  shouldFailCleanup: boolean;
  cleanupStartedListener: (() => void) | undefined;
  cleanupGate: Promise<void> | undefined;
}
const reloadControlGlobal = globalThis as typeof globalThis & {
  [reloadControlSymbol]?: ReloadControl;
};

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The fixture feature both workspaces load: identical ids everywhere. */
const fixtureFeature = `
import { Type } from "typebox";

import { type ChannelContract, withHandlers } from "@uix/api/channels";
import { defineFeature } from "@uix/api/feature";
import { normalizeResourceRoute } from "@uix/api/resource-routes";
import { defineSettings } from "@uix/api/settings";
import { defineWebRoute, withWebRouteHandler } from "@uix/api/web-routes";

const contract = {
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
    wait_for_shutdown: {
      requestSchema: Type.Object({}),
      responseSchema: Type.String(),
    },
  },
  events: {},
} as const satisfies ChannelContract;

const viewpointContract = {
  requests: {
    increment: {
      requestSchema: Type.Void(),
      responseSchema: Type.Number(),
    },
    read_view: {
      requestSchema: Type.Void(),
      responseSchema: Type.Union([Type.String(), Type.Null()]),
    },
    write_view: {
      requestSchema: Type.Object({ content: Type.String() }),
      responseSchema: Type.Void(),
    },
    continue_web_route: {
      requestSchema: Type.Void(),
      responseSchema: Type.Void(),
    },
  },
  events: {
    incremented: { event: Type.Number() },
  },
} as const satisfies ChannelContract;

const viewpointWebRoute = defineWebRoute({
  method: "GET",
  path: "/view",
  query: Type.Object(
    { key: Type.String({ pattern: "^[a-z0-9-]+(?:/[a-z0-9-]+)*$" }) },
    { additionalProperties: false },
  ),
  responses: { 200: { content: "html-document" } },
});

export const feature = defineFeature({
  id: "echo",
  settings: defineSettings({
    schema: Type.Object({ greeting: Type.String() }),
    default: { greeting: "hello" },
  }),
  workspace(ctx) {
    const docs = ctx.documents.createStore({ namespace: "echo" });
    return {
      agentChannelContracts: [viewpointContract],
      viewpointWebRouteContracts: [viewpointWebRoute],
      channels: [
        {
          requests: {
            ping: {
              requestSchema: Type.Object({}),
              responseSchema: Type.String(),
              handler: () => ctx.settings.get("greeting") ?? "no-greeting",
              log: {
                describeRequest: () => ({ kind: "ping" }),
                describeResponse: (value) => ({ characters: value.length }),
              },
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
            wait_for_shutdown: {
              requestSchema: Type.Object({}),
              responseSchema: Type.String(),
              handler: (_request, operation) =>
                new Promise((resolve, reject) => {
                  const rejectCancellation = () =>
                    reject(operation.signal.reason);
                  if (operation.signal.aborted) {
                    rejectCancellation();
                    return;
                  }
                  operation.signal.addEventListener(
                    "abort",
                    rejectCancellation,
                    { once: true },
                  );
                }),
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
      async [Symbol.asyncDispose]() {
        const control = (globalThis as {
          [key: symbol]: {
            shouldFailCleanup?: boolean;
            cleanupStartedListener?: () => void;
            cleanupGate?: Promise<void>;
          } | undefined;
        })[Symbol.for("uix.runtime.test.reload-control")];
        control?.cleanupStartedListener?.();
        await control?.cleanupGate;
        if (control?.shouldFailCleanup) {
          throw new Error("fixture workspace cleanup failed");
        }
      },
    };
  },
  agent(ctx) {
    let count = 0;
    const webRouteGate = Promise.withResolvers<void>();
    const documents = ctx.documents.createStore({ namespace: "echo-view" });
    const events = ctx.channels.createPublisher(viewpointContract);
    return {
      channels: [
        withHandlers(viewpointContract, {
          increment: {
            handler: () => {
              count += 1;
              events.incremented(count);
              return count;
            },
          },
          read_view: {
            handler: () => documents.getCurrent("notes"),
          },
          write_view: {
            handler: ({ content }) => documents.setCurrent("notes", content),
          },
          continue_web_route: {
            handler: () => {
              webRouteGate.resolve();
            },
          },
        }),
      ],
      webRoutes: [
        withWebRouteHandler(viewpointWebRoute, async ({ query }, respond) => {
          const key = query.key;
          if (key === "wait") await webRouteGate.promise;
          if (key === "fail") throw new Error("fixture route failed");
          return respond(200, (await documents.getCurrent("notes")) ?? "empty");
        }),
      ],
      [Symbol.dispose]() {
        webRouteGate.resolve();
      },
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
  readonly isRegistered: boolean;
  request(content: ContentRequest): Promise<Response>;
}

function createTestTransports(): FakeTransports {
  let handler: Parameters<ContentTransportRegistrar>[0] | undefined;
  return {
    dependencies: {
      contentTransportRegistrar: (requestHandler) => {
        if (handler) throw new Error("Content transport already registered");
        handler = requestHandler;
        return disposable(() => {
          if (handler === requestHandler) handler = undefined;
        });
      },
      launchProviderAuthLink: () => {},
    },
    get isRegistered() {
      return handler !== undefined;
    },
    request(content) {
      if (!handler) throw new Error("Content transport is not registered");
      return Promise.resolve(handler(content));
    },
  };
}

/** A temp workspace root plus its manifest referencing the shared fixture. */
async function makeWorkspace(
  name: string,
  fixtureDir: string,
  greeting: string,
): Promise<Workspace> {
  const dir = await mkdtemp(join(tmpdir(), `iso-${name}-`));
  await mkdir(join(dir, ".uix", "sessions"), { recursive: true });
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

async function makeCanvasWorkspace(): Promise<Workspace> {
  const dir = await mkdtemp(join(tmpdir(), "canvas-viewpoints-"));
  await mkdir(join(dir, ".uix", "sessions"), { recursive: true });
  await writeFile(
    join(dir, "uix.workspace.json"),
    JSON.stringify(
      {
        name: "canvas-viewpoints",
        features: [
          {
            entry: join(__dirname, "../../../src/features/canvas/index.ts"),
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

function loadedEventCount(events: RuntimeEvent[]): number {
  return events.filter((event) => event.channel === "uix.composition_loaded")
    .length;
}

function admitSession(target: SessionTarget): AttachmentAdmission {
  return { kind: "session", target };
}

async function dispatch(
  attachment: Attachment,
  request: CanonicalRequest,
): Promise<CanonicalResponse> {
  await using prepared = attachment.prepareDispatch(request);
  return await prepared.invoke();
}

function createViewpointWebRequest(
  attachment: Attachment,
  pathname: string,
  queryString = "key=main",
  method = "GET",
): ViewpointWebRequest {
  return {
    binding: attachment.webBinding,
    namespace: "canvas",
    method,
    pathname,
    queryString,
  };
}

describe("workspace runtime isolation", () => {
  it("rejects an invalid HTML route during feature activation and removes its earlier contributions", async () => {
    const fixtureDir = await writeFixture();
    await writeFile(
      join(fixtureDir, "echo.ts"),
      fixtureFeature.replace('path: "/view"', 'path: "/reports/view"'),
    );
    const workspace = await makeWorkspace(
      "html-path-admission",
      fixtureDir,
      "hello",
    );
    const transports = createTestTransports();
    await using runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("html-path-admission"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: transports.dependencies,
    });
    const activation = await runtime.load();
    expect(activation.activated).toEqual([]);
    expect(activation.failed).toHaveLength(1);
    expect(activation.failed[0].error.message).toContain(
      'Invalid html-document route path "/reports/view"',
    );
    expect(activation.failed[0].error.message).toContain(
      "Put content identifiers in query input",
    );
    expect(
      await transports.request({
        kind: "resource",
        request: new Request("uix-resource://echo.html-path-admission/greet/"),
      }),
    ).toMatchObject({ status: 404 });
  });
  it("replaces the observable web binding for each attachment target", async () => {
    const fixtureDir = await writeFixture();
    const workspace = await makeWorkspace(
      "attachment-web-bindings",
      fixtureDir,
      "hello",
    );
    const runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("attachment-web-bindings"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: createTestTransports().dependencies,
    });
    await runtime.load();
    const first = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const peer = (await runtime.createAttachment(admitSession(first.target)))
      .attachment;
    const destination = (
      await runtime.createAttachment({ kind: "new-session" })
    ).attachment;
    const initialBinding = first.webBinding;
    const peerBinding = peer.webBinding;
    const changes: string[] = [];
    using _failingBindingSubscription = first.onWebBindingChange(() => {
      throw new Error("observer failed");
    });
    using _bindingSubscription = first.onWebBindingChange((binding) => {
      changes.push(binding);
    });

    expect(initialBinding).not.toBe(peerBinding);
    await first.retarget(destination.target);

    expect(first.webBinding).not.toBe(initialBinding);
    expect(changes).toEqual([first.webBinding]);
    expect(peer.webBinding).toBe(peerBinding);
    await expect(
      first.retarget({
        sessionId: first.target.sessionId,
        branchId: toBranchId("unsupported-branch"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    expect(changes).toEqual([first.webBinding]);

    first[Symbol.dispose]();
    peer[Symbol.dispose]();
    destination[Symbol.dispose]();
    await runtime[Symbol.asyncDispose]();
  });

  it("dispatches the production Canvas route through each attachment binding", async () => {
    const workspace = await makeCanvasWorkspace();
    const runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("canvas-web-routes"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: createTestTransports().dependencies,
    });
    await runtime.load();
    const first = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const second = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const writeback = toChannelCanonicalId("canvas", "writeback");
    await dispatch(first, {
      channel: writeback,
      payload: { key: "main", html: "<main>first Agent</main>" },
    });
    await dispatch(second, {
      channel: writeback,
      payload: { key: "main", html: "<main>second Agent</main>" },
    });

    await expect(
      runtime.dispatchViewpointWebRequest(
        createViewpointWebRequest(first, "/view"),
      ),
    ).resolves.toEqual({
      status: 200,
      content: "html-document",
      body: expect.stringContaining("<main>first Agent</main>") as unknown,
    });
    await expect(
      runtime.dispatchViewpointWebRequest(
        createViewpointWebRequest(second, "/view"),
      ),
    ).resolves.toEqual({
      status: 200,
      content: "html-document",
      body: expect.stringContaining("<main>second Agent</main>") as unknown,
    });
    await expect(
      runtime.dispatchViewpointWebRequest(
        createViewpointWebRequest(first, "/view", "key=Not-Valid"),
      ),
    ).resolves.toMatchObject({ status: 400, content: "text" });
    await expect(
      runtime.dispatchViewpointWebRequest(
        createViewpointWebRequest(first, "/unknown"),
      ),
    ).resolves.toMatchObject({ status: 404, content: "text" });
    await expect(
      runtime.dispatchViewpointWebRequest(
        createViewpointWebRequest(first, "/view", "key=main", "POST"),
      ),
    ).resolves.toMatchObject({ status: 405, content: "text" });

    first[Symbol.dispose]();
    second[Symbol.dispose]();
    await runtime[Symbol.asyncDispose]();
  });

  it("serves nested Canvas keys through the content transport without rewriting HTML", async () => {
    const workspace = await makeCanvasWorkspace();
    const transports = createTestTransports();
    await using runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("canvas-content"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: transports.dependencies,
    });
    await runtime.load();
    using first = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    using second = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const viewpoints = [
      [first, "first"],
      [second, "second"],
    ] as const;
    for (const [attachment, label] of viewpoints) {
      await dispatch(attachment, {
        channel: toChannelCanonicalId("canvas", "writeback"),
        payload: {
          key: "reports/main",
          html: `<main>${label}</main>\n<a href="#section">jump</a>\n<img src="assets/chart.svg">`,
        },
      });
    }
    for (const [attachment, label] of viewpoints) {
      const request = createViewpointWebRequest(
        attachment,
        "/view",
        "key=reports%2Fmain",
      );
      const response = await transports.request({ kind: "viewpoint", request });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const html = await response.text();
      const canonical = await runtime.dispatchViewpointWebRequest(request);
      expect(html).toBe(canonical.body);
      expect(html).toContain(`<main>${label}</main>`);
      expect(html).toContain('<a href="#section">jump</a>');
      expect(html).toContain('<img src="assets/chart.svg">');
      expect(html).not.toContain("<base");
      expect(html).not.toContain("data-uix-");
      expect(html).not.toContain(attachment.webBinding);

      for (const [pathname, queryString, method, status] of [
        ["/view", "", "GET", 400],
        ["/view", "key=Not-Valid", "GET", 400],
        ["/view", "key=reports/main&key=other", "GET", 400],
        ["/view", "key=reports/main&extra=1", "GET", 400],
        ["/missing", "key=reports/main", "GET", 404],
        ["/documents/reports/main", "", "GET", 404],
        ["/view/", "key=reports/main", "GET", 404],
        ["/view", "key=reports/main", "POST", 405],
      ] as const) {
        const rejected = await transports.request({
          kind: "viewpoint",
          request: { ...request, pathname, queryString, method },
        });
        expect(rejected.status).toBe(status);
        expect(rejected.headers.get("content-type")).toBe(
          "text/plain; charset=utf-8",
        );
        expect(await rejected.text()).not.toContain("<base");
      }
      attachment[Symbol.dispose]();
      expect(
        await transports.request({ kind: "viewpoint", request }),
      ).toMatchObject({ status: 404 });
    }
  });

  it("keeps accepted web requests on their retained Agent generation", async () => {
    const fixtureDir = await writeFixture();
    const workspace = await makeWorkspace(
      "retained-web-route",
      fixtureDir,
      "hello",
    );
    const runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("retained-web-route"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: createTestTransports().dependencies,
    });
    await runtime.load();
    const first = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const peer = (await runtime.createAttachment(admitSession(first.target)))
      .attachment;
    const destination = (
      await runtime.createAttachment({ kind: "new-session" })
    ).attachment;
    const writeView = toChannelCanonicalId("echo", "write_view");
    await dispatch(first, {
      channel: writeView,
      payload: { content: "first Agent" },
    });
    await dispatch(destination, {
      channel: writeView,
      payload: { content: "second Agent" },
    });

    const oldBinding = first.webBinding;
    const accepted = runtime.dispatchViewpointWebRequest({
      binding: oldBinding,
      namespace: "echo",
      method: "GET",
      pathname: "/view",
      queryString: "key=wait",
    });
    await first.retarget(destination.target);

    await expect(
      runtime.dispatchViewpointWebRequest({
        binding: oldBinding,
        namespace: "echo",
        method: "GET",
        pathname: "/view",
        queryString: "key=main",
      }),
    ).resolves.toEqual({
      status: 404,
      content: "text",
      body: "Web route not found.",
    });
    await expect(
      runtime.dispatchViewpointWebRequest({
        binding: first.webBinding,
        namespace: "echo",
        method: "GET",
        pathname: "/view",
        queryString: "key=main",
      }),
    ).resolves.toMatchObject({ status: 200, body: "second Agent" });

    await dispatch(peer, {
      channel: toChannelCanonicalId("echo", "continue_web_route"),
      payload: undefined,
    });
    await expect(accepted).resolves.toMatchObject({
      status: 200,
      body: "first Agent",
    });
    await expect(
      runtime.dispatchViewpointWebRequest({
        binding: first.webBinding,
        namespace: "echo",
        method: "GET",
        pathname: "/view",
        queryString: "key=fail",
      }),
    ).resolves.toEqual({
      status: 500,
      content: "text",
      body: "Internal web route error.",
    });

    first[Symbol.dispose]();
    peer[Symbol.dispose]();
    destination[Symbol.dispose]();
    await runtime[Symbol.asyncDispose]();
  });

  it("rejects reload until accepted web handlers finish and disposes their reload guards after failure", async () => {
    await using fixtureLifetime = new AsyncDisposableStack();
    const fixtureDir = await writeFixture();
    fixtureLifetime.defer(() =>
      rm(fixtureDir, { recursive: true, force: true }),
    );
    const workspace = await makeWorkspace("web-reload", fixtureDir, "hello");
    fixtureLifetime.defer(() =>
      rm(workspace.stateRoot, { recursive: true, force: true }),
    );
    await using runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("web-reload"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: createTestTransports().dependencies,
    });
    await runtime.load();
    using attachment = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const binding = attachment.webBinding;
    const request: ViewpointWebRequest = {
      binding,
      namespace: "echo",
      method: "GET",
      pathname: "/view",
      queryString: "key=wait",
    };
    const accepted = runtime.dispatchViewpointWebRequest(request);
    const reloadRequest = {
      channel: toChannelCanonicalId("uix", "reload"),
      payload: undefined,
    };
    try {
      expect(await dispatch(attachment, reloadRequest)).toMatchObject({
        ok: false,
        error: {
          code: "handler_error",
          message: expect.stringContaining("reload guard is held") as unknown,
        },
      });
    } finally {
      await dispatch(attachment, {
        channel: toChannelCanonicalId("echo", "continue_web_route"),
        payload: undefined,
      });
    }
    await expect(accepted).resolves.toMatchObject({ status: 200 });
    expect(await dispatch(attachment, reloadRequest)).toMatchObject({
      ok: true,
    });
    expect(attachment.webBinding).toBe(binding);
    await expect(
      runtime.dispatchViewpointWebRequest({
        ...request,
        queryString: "key=main",
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      runtime.dispatchViewpointWebRequest({
        ...request,
        queryString: "key=fail",
      }),
    ).resolves.toMatchObject({ status: 500 });
    expect(await dispatch(attachment, reloadRequest)).toMatchObject({
      ok: true,
    });
  });

  it("cancels accepted dispatches before guarded workspace teardown", async () => {
    const fixtureDir = await writeFixture();
    const workspace = await makeWorkspace(
      "dispatch-cancellation",
      fixtureDir,
      "hello",
    );
    const runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("dispatch-cancellation"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: createTestTransports().dependencies,
    });
    await runtime.load();
    const attachment = (await runtime.createAttachment({ kind: "new-session" }))
      .attachment;
    const retargetDestination = (
      await runtime.createAttachment({ kind: "new-session" })
    ).attachment;
    const prepared = attachment.prepareDispatch({
      channel: toChannelCanonicalId("echo", "wait_for_shutdown"),
      payload: {},
    });
    let responseSettled = false;
    const response = prepared.invoke().then((result) => {
      responseSettled = true;
      return result;
    });

    await attachment.retarget(retargetDestination.target);
    retargetDestination[Symbol.dispose]();
    await Promise.resolve();
    expect(responseSettled).toBe(false);

    attachment[Symbol.dispose]();
    await Promise.resolve();
    expect(responseSettled).toBe(false);

    const disposal = runtime[Symbol.asyncDispose]();
    await expect(response).resolves.toMatchObject({
      ok: false,
      error: {
        code: "handler_error",
        message: "Operation owner is shutting down",
      },
    });
    await expect(disposal).resolves.toBeUndefined();
  });

  it("keeps the production Canvas on the selected concurrent-session viewpoint", async () => {
    const workspace = await makeCanvasWorkspace();
    const runtime = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("canvas-workspace"),
      workspace,
      piAppDataDir: join(workspace.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: createTestTransports().dependencies,
    });
    const events: RuntimeEvent[] = [];
    using _events = runtime.onEvent((event) => events.push(event));

    const activation = await runtime.load();
    expect(activation.activated.map(({ id }) => id)).toEqual(["canvas"]);

    const selected = (await runtime.createAttachment({ kind: "fallback" }))
      .attachment;
    const sessionA = selected.target.sessionId;
    const peerA = (
      await runtime.createAttachment(admitSession({ sessionId: sessionA }))
    ).attachment;
    const read = async (attachment: Attachment): Promise<string> => {
      const response = await runtime.dispatchViewpointWebRequest(
        createViewpointWebRequest(attachment, "/view"),
      );
      expect(response.status).toBe(200);
      return response.body;
    };
    const writeback = toChannelCanonicalId("canvas", "writeback");
    const key = "main";
    const htmlA = "<main>session A</main>";
    const htmlB = "<main>session B</main>";

    await expect(
      dispatch(peerA, {
        channel: writeback,
        payload: { key, html: htmlA },
      }),
    ).resolves.toEqual({ ok: true, value: undefined });

    const newSession = toChannelCanonicalId("agent", "new_session");
    await expect(
      dispatch(selected, {
        channel: newSession,
        payload: { mutationId: "new-session-b" },
      }),
    ).resolves.toMatchObject({ ok: true });
    const sessionB = selected.target.sessionId;
    expect(sessionB).not.toBe(sessionA);
    expect(peerA.target.sessionId).toBe(sessionA);
    await expect(read(selected)).resolves.toContain("<body></body>");

    await dispatch(selected, {
      channel: writeback,
      payload: { key, html: htmlB },
    });
    await expect(read(peerA)).resolves.toContain(htmlA);
    await expect(read(selected)).resolves.toContain(htmlB);

    events.length = 0;
    await expect(
      dispatch(selected, {
        channel: toChannelCanonicalId("uix", "reload"),
        payload: undefined,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { featuresActivated: 1, featuresFailed: 0 },
    });
    const changedScopes = events
      .filter(({ channel }) => channel === "canvas.changed")
      .map(({ scope }) => scope);
    expect(changedScopes).toEqual(
      expect.arrayContaining([
        { kind: "session", sessionId: sessionA },
        { kind: "session", sessionId: sessionB },
      ]),
    );
    const surfacesChangedIndex = events.findIndex(
      ({ channel }) => channel === "uix.surfaces_changed",
    );
    const restoredCanvasIndices = events
      .map(({ channel }, index) => (channel === "canvas.changed" ? index : -1))
      .filter((index) => index >= 0);
    expect(restoredCanvasIndices.length).toBeGreaterThan(0);
    expect(Math.max(...restoredCanvasIndices)).toBeLessThan(
      surfacesChangedIndex,
    );
    await expect(read(peerA)).resolves.toContain(htmlA);
    await expect(read(selected)).resolves.toContain(htmlB);

    peerA[Symbol.dispose]();
    selected[Symbol.dispose]();
    await runtime[Symbol.asyncDispose]();
  });

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
    const transportsA = createTestTransports();
    const transportsB = createTestTransports();

    await using runtimeA = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("ws-a"),
      workspace: workspaceA,
      piAppDataDir: join(workspaceA.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: transportsA.dependencies,
    });
    await using runtimeB = createWorkspaceRuntime({
      workspaceId: toWorkspaceId("ws-b"),
      workspace: workspaceB,
      piAppDataDir: join(workspaceB.stateRoot, ".pi"),
      apiModuleDir,
      dependencies: transportsB.dependencies,
    });

    const eventsA: RuntimeEvent[] = [];
    const eventsB: RuntimeEvent[] = [];
    using _eventsA = runtimeA.onEvent((event) => eventsA.push(event));
    using _eventsB = runtimeB.onEvent((event) => eventsB.push(event));

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

    // A fallback admission resolves inside the runtime and returns an
    // attachment with the accepted durable session identity.
    const fallbackA = (await runtimeA.createAttachment({ kind: "fallback" }))
      .attachment;
    expect(fallbackA.target.sessionId).not.toBe("");
    const freshConnectionA = (
      await runtimeA.createAttachment({ kind: "new-session" })
    ).attachment;
    expect(freshConnectionA.target.sessionId).not.toBe(
      fallbackA.target.sessionId,
    );
    freshConnectionA[Symbol.dispose]();
    // A second attachment to the same durable session shares the warm primary
    // instance. A second workspace remains independent.
    const fallbackB = (await runtimeB.createAttachment({ kind: "fallback" }))
      .attachment;
    const attachA = (
      await runtimeA.createAttachment(
        admitSession({ sessionId: fallbackA.target.sessionId }),
      )
    ).attachment;
    const attachB = (
      await runtimeB.createAttachment(
        admitSession({ sessionId: fallbackB.target.sessionId }),
      )
    ).attachment;
    await expect(
      runtimeA.createAttachment(
        admitSession({
          sessionId: fallbackA.target.sessionId,
          branchId: toBranchId("branch-1"),
        }),
      ),
    ).rejects.toThrow("Branch session targets are not supported");
    await expect(
      attachA.retarget({
        sessionId: fallbackA.target.sessionId,
        branchId: toBranchId("branch-1"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    expect(attachA.target.sessionId).toBe(fallbackA.target.sessionId);
    // The same canonical channel id resolves per-workspace behavior: each
    // feature's handler reads its own persisted greeting setting.
    const history = toChannelCanonicalId("agent", "session_history");
    expect(
      await dispatch(fallbackA, { channel: history, payload: {} }),
    ).toEqual(await dispatch(attachA, { channel: history, payload: {} }));
    // New Session retargets only the requesting attachment. Its peer remains
    // on the shared previous instance and can still read that history.
    const previousSessionId = fallbackA.target.sessionId;
    const newSession = toChannelCanonicalId("agent", "new_session");
    expect(
      await dispatch(fallbackA, {
        channel: newSession,
        payload: { mutationId: "fallback-session-a" },
      }),
    ).toMatchObject({ ok: true });
    expect(fallbackA.target.sessionId).not.toBe(previousSessionId);
    expect(attachA.target.sessionId).toBe(previousSessionId);
    const freshSessionId = fallbackA.target.sessionId;

    // The global channel contract selects a handler from the accepted Agent
    // guard. Peers on one session share a closure. Different sessions and
    // workspaces do not.
    const increment = toChannelCanonicalId("echo", "increment");
    expect(
      await dispatch(attachA, { channel: increment, payload: undefined }),
    ).toEqual({ ok: true, value: 1 });
    expect(
      await dispatch(fallbackA, { channel: increment, payload: undefined }),
    ).toEqual({ ok: true, value: 1 });
    expect(
      await dispatch(attachA, { channel: increment, payload: undefined }),
    ).toEqual({ ok: true, value: 2 });
    expect(
      await dispatch(attachB, { channel: increment, payload: undefined }),
    ).toEqual({ ok: true, value: 1 });
    expect(eventsA).toContainEqual(
      expect.objectContaining({
        channel: "echo.incremented",
        scope: { kind: "session", sessionId: previousSessionId },
        payload: 2,
      }),
    );

    const readView = toChannelCanonicalId("echo", "read_view");
    const writeView = toChannelCanonicalId("echo", "write_view");
    await dispatch(attachA, {
      channel: writeView,
      payload: { content: "previous session" },
    });
    expect(
      await dispatch(fallbackA, { channel: readView, payload: undefined }),
    ).toEqual({ ok: true, value: null });
    await dispatch(fallbackA, {
      channel: writeView,
      payload: { content: "fresh session" },
    });
    expect(
      await dispatch(attachA, { channel: readView, payload: undefined }),
    ).toEqual({ ok: true, value: "previous session" });
    expect(
      await dispatch(fallbackA, { channel: readView, payload: undefined }),
    ).toEqual({ ok: true, value: "fresh session" });

    const switchSession = toChannelCanonicalId("agent", "switch_session");
    const ping = toChannelCanonicalId("echo", "ping");
    const closingAttachment = (
      await runtimeA.createAttachment(
        admitSession({ sessionId: freshSessionId }),
      )
    ).attachment;
    await using preparedPing = closingAttachment.prepareDispatch({
      channel: ping,
      payload: {},
    });
    await using acceptedSwitch = closingAttachment.prepareDispatch({
      channel: switchSession,
      payload: { sessionId: freshSessionId },
    });
    await closingAttachment.retarget({ sessionId: previousSessionId });
    await dispatch(fallbackA, {
      channel: switchSession,
      payload: { sessionId: previousSessionId },
    });
    expect(fallbackA.target.sessionId).toBe(previousSessionId);

    // A preparation keeps its accepted context and channel log policy after
    // the attachment moves.
    expect(preparedPing.logOptions.describeRequest?.({})).toEqual({
      kind: "ping",
    });
    expect(await preparedPing.invoke()).toEqual({ ok: true, value: "hello-A" });

    // Accepted work survives attachment closure. It can guard and inspect the
    // requested agent without installing a target on the closed attachment.
    closingAttachment[Symbol.dispose]();
    expect(await acceptedSwitch.invoke()).toMatchObject({ ok: true });
    expect(closingAttachment.target.sessionId).toBe(previousSessionId);
    expect(await dispatch(attachA, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A",
    });
    expect(await dispatch(attachB, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-B",
    });

    // Document stores are rooted per workspace: A's writes never reach B.
    const writeDoc = toChannelCanonicalId("echo", "write_doc");
    const readDoc = toChannelCanonicalId("echo", "read_doc");
    await dispatch(attachA, {
      channel: writeDoc,
      payload: { content: "a-notes" },
    });
    expect(await dispatch(attachA, { channel: readDoc, payload: {} })).toEqual({
      ok: true,
      value: "a-notes",
    });
    expect(await dispatch(attachB, { channel: readDoc, payload: {} })).toEqual({
      ok: true,
      value: null,
    });

    // The substrate settings channel answers per workspace scope.
    const getSetting = toChannelCanonicalId("uix", "get_setting");
    expect(
      await dispatch(attachA, {
        channel: getSetting,
        payload: { featureId: "echo", key: "greeting" },
      }),
    ).toEqual({ ok: true, value: "hello-A" });
    expect(
      await dispatch(attachB, {
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
    const responseA = await transportsA.request({
      kind: "resource",
      request: new Request(urlA),
    });
    const responseB = await transportsB.request({
      kind: "resource",
      request: new Request(urlB),
    });
    expect(await responseA.text()).toBe("hello-A");
    expect(await responseB.text()).toBe("hello-B");
    expect(Object.fromEntries(responseA.headers)).toEqual({
      "content-type": "text/plain;charset=UTF-8",
    });
    expect(Object.fromEntries(responseB.headers)).toEqual(
      Object.fromEntries(responseA.headers),
    );

    // Surface composition: both serve the same feature id, built per runtime.
    const surfaces = toChannelCanonicalId("uix", "surfaces");
    const surfacesA = await dispatch(attachA, {
      channel: surfaces,
      payload: undefined,
    });
    const surfacesB = await dispatch(attachB, {
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
      channelNamespaces: string[];
      manifestFound: boolean;
    };
    const surfacesValueB = surfacesB.value as {
      surfaces: Array<{ featureId: string; url: string }>;
      channelNamespaces: string[];
      manifestFound: boolean;
    };
    expect(surfacesValueA.surfaces).toHaveLength(1);
    expect(surfacesValueB.surfaces).toHaveLength(1);
    expect(surfacesValueA.surfaces[0].featureId).toBe("echo");
    expect(surfacesValueB.surfaces[0].featureId).toBe("echo");
    expect(surfacesValueA.channelNamespaces).toEqual(["agent", "echo", "uix"]);
    expect(surfacesValueB.channelNamespaces).toEqual(["agent", "echo", "uix"]);
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
    eventsA.length = 0;
    const reloadA = await dispatch(attachA, {
      channel: toChannelCanonicalId("uix", "reload"),
      payload: undefined,
    });
    expect(reloadA).toMatchObject({
      ok: true,
      value: { featuresActivated: 1, featuresFailed: 0 },
    });
    expect(eventsA).toContainEqual(
      expect.objectContaining({
        channel: "uix.surfaces_changed",
        scope: { kind: "workspace" },
      }),
    );
    expect(await dispatch(attachA, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A2",
    });
    expect(await dispatch(attachB, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-B",
    });
    expect(
      await dispatch(attachA, { channel: readView, payload: undefined }),
    ).toEqual({ ok: true, value: "previous session" });
    expect(
      await dispatch(attachA, { channel: increment, payload: undefined }),
    ).toEqual({ ok: true, value: 1 });

    // While asynchronous feature replacement is active, an already-prepared
    // Agent feature request cannot start and reach the stale generation.
    const reloadControl: ReloadControl = {
      shouldFailCleanup: false,
      cleanupStartedListener: undefined,
      cleanupGate: undefined,
    };
    const previousReloadControl = reloadControlGlobal[reloadControlSymbol];
    reloadControlGlobal[reloadControlSymbol] = reloadControl;
    using _reloadControlLifetime = disposable(() => {
      reloadControl.shouldFailCleanup = false;
      reloadControlGlobal[reloadControlSymbol] = previousReloadControl;
    });
    const cleanupStarted = createDeferred();
    const cleanupGate = createDeferred();
    reloadControl.cleanupStartedListener = cleanupStarted.resolve;
    reloadControl.cleanupGate = cleanupGate.promise;
    await using preparedDuringReload = attachA.prepareDispatch({
      channel: increment,
      payload: undefined,
    });
    const activeReload = dispatch(attachA, {
      channel: toChannelCanonicalId("uix", "reload"),
      payload: undefined,
    });
    try {
      await cleanupStarted.promise;
      const blockedDuringReload = await preparedDuringReload.invoke();
      expect(blockedDuringReload.ok).toBe(false);
      if (blockedDuringReload.ok) {
        throw new Error("Prepared Agent request unexpectedly succeeded");
      }
      expect(blockedDuringReload.error.code).toBe("handler_error");
      expect(blockedDuringReload.error.message).toContain(
        "Workspace reload is active",
      );
    } finally {
      cleanupGate.resolve();
    }
    await expect(activeReload).resolves.toMatchObject({ ok: true });
    reloadControl.cleanupStartedListener = undefined;
    reloadControl.cleanupGate = undefined;

    // Cleanup failure is reported only after replacement and renderer
    // notification complete. The active-reload state is still released.
    reloadControl.shouldFailCleanup = true;
    eventsA.length = 0;
    expect(
      await dispatch(attachA, {
        channel: toChannelCanonicalId("uix", "reload"),
        payload: undefined,
      }),
    ).toMatchObject({ ok: false, error: { code: "handler_error" } });
    reloadControl.shouldFailCleanup = false;
    expect(eventsA).toContainEqual(
      expect.objectContaining({
        channel: "uix.surfaces_changed",
        scope: { kind: "workspace" },
      }),
    );
    expect(await dispatch(attachA, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A2",
    });

    // A malformed candidate returns a structured canonical error and leaves
    // the accepted composition active.
    await writeFile(workspaceA.manifestPath, "{ invalid");
    expect(
      await dispatch(attachA, {
        channel: toChannelCanonicalId("uix", "reload"),
        payload: undefined,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "handler_error" },
    });
    expect(await dispatch(attachA, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A2",
    });

    // A failed reload does not poison serialization. Concurrent requests queue
    // and both reconcile the repaired manifest successfully.
    await writeFile(
      workspaceA.manifestPath,
      JSON.stringify(
        {
          name: "workspace-a",
          features: [
            {
              entry: join(fixtureDir, "echo.ts"),
              settings: { greeting: "hello-A3" },
            },
          ],
        },
        null,
        2,
      ),
    );
    const queuedReloads = await Promise.all([
      dispatch(attachA, {
        channel: toChannelCanonicalId("uix", "reload"),
        payload: undefined,
      }),
      dispatch(attachA, {
        channel: toChannelCanonicalId("uix", "reload"),
        payload: undefined,
      }),
    ]);
    expect(queuedReloads).toHaveLength(2);
    for (const response of queuedReloads) {
      expect(response).toMatchObject({
        ok: true,
        value: { featuresActivated: 1 },
      });
    }
    expect(await dispatch(attachA, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-A3",
    });

    // Disposing one runtime removes only its state and routes. Concurrent
    // callers share the same drain rather than observing early completion.
    const disposalA = runtimeA[Symbol.asyncDispose]();
    expect(runtimeA[Symbol.asyncDispose]()).toBe(disposalA);
    await disposalA;
    expect(() =>
      attachA.prepareDispatch({ channel: ping, payload: {} }),
    ).toThrow("Attachment is disposed");
    expect(await dispatch(attachB, { channel: ping, payload: {} })).toEqual({
      ok: true,
      value: "hello-B",
    });
    expect(transportsA.isRegistered).toBe(false);
    expect(transportsB.isRegistered).toBe(true);
    expect(
      await transportsB.request({
        kind: "resource",
        request: new Request(urlB),
      }),
    ).toMatchObject({ status: 200 });

    await runtimeB[Symbol.asyncDispose]();
    expect(transportsB.isRegistered).toBe(false);
  });
});
