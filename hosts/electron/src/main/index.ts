// Starts the discrete Electron host over shared supervision, runtime, and browser clients.
//
// The host opens one selected workspace or its launcher. Each workspace window
// binds its webContents identity to one supervisor guard and attachment, while
// the host owns physical IPC and resource transport. Disposable bags
// pair synchronous bindings and supervised teardown with Electron shutdown.

import fs from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";

import { WorkspaceSupervisor } from "@uix/host";
import {
  type Attachment,
  createWorkspaceRuntime,
  toWorkspaceId,
} from "@uix/runtime";
import { WorkspaceManifestFileName } from "@uix/runtime/features/manifest";
import { installProcessHandlers } from "@uix/runtime/lifecycle";
import { createLogger } from "@uix/runtime/log";
import { resolveWorkspace, type Workspace } from "@uix/runtime/workspace-roots";

import { AttachmentWebBindingState } from "./attachment-web-binding-state";
import {
  bindExternalWebLinks,
  createExternalWebLinkLauncher,
} from "./external-links";
import * as ipc from "./ipc";
import {
  AsyncDisposableBag,
  disposable,
  DisposableBag,
  onApp,
  onWindow,
} from "./lifecycle";
import { createRecentsStore, type RecentsStore } from "./recents";
import {
  bindResourceProtocol,
  ElectronResourceTransport,
  registerResourceProtocol,
} from "./resource-transport";
import { scaffoldWorkspace } from "./scaffold";
import {
  Channels,
  type LauncherActionResult,
  type LauncherCreateRequest,
  type LauncherOpenRequest,
  type LauncherState,
} from "../channel-transport";

const isDev = !app.isPackaged;
const LocalWorkspaceId = "local";

// Electron requires privileged scheme declarations before app ready. Manifest
// feature resources register only after their workspace runtime boots.
registerResourceProtocol();

interface OpenShellWindowOptions {
  page: "index" | "launcher";
  onClosed?: () => void;
}

// Section: Shell window
function openShellWindow(
  parentLifetime: DisposableBag,
  options: OpenShellWindowOptions,
): BrowserWindow {
  const size =
    options.page === "launcher"
      ? { width: 560, height: 480, resizable: false }
      : { width: 1100, height: 720 };
  const win = new BrowserWindow({
    ...size,
    show: !app.commandLine.hasSwitch("hidden"),
    title: "UIX",
    icon: join(__dirname, "../../hosts/electron/assets/icon-black-large.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const windowBag = parentLifetime.add(new DisposableBag());
  windowBag.add(
    bindExternalWebLinks(win.webContents, (url) => shell.openExternal(url)),
  );
  windowBag.add(
    onWindow(win, "closed", () => {
      windowBag[Symbol.dispose]();
      options.onClosed?.();
    }),
  );

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devUrl) {
    void win.loadURL(
      options.page === "launcher" ? `${devUrl}/launcher.html` : devUrl,
    );
  } else {
    void win.loadFile(join(__dirname, `../renderer/${options.page}.html`));
  }

  return win;
}

// Section: Workspace

/**
 * Boot the substrate against a workspace and open its window. Everything
 * workspace-bound (state root, feature composition, agent sessions, reload
 * coordination) lives in the workspace runtime constructed here. The shell
 * above it only decides *which* workspace to open and provides the dependencies.
 */
async function openWorkspace(
  hostBag: DisposableBag,
  workspaceBag: AsyncDisposableBag,
  recents: RecentsStore,
  workspace: Workspace,
  piAppDataDir: string,
  resourceTransport: ElectronResourceTransport,
): Promise<void> {
  // Raw IPC payloads spill to a per-run file under the state root. Path is
  // logged as `ipc_log_file` when armed.
  ipc.initLogFile(workspace.stateRoot);

  const workspaceId = toWorkspaceId(LocalWorkspaceId);
  const apiModuleDir = join(app.getAppPath(), "packages/api/src");
  const connectionByWebContentsId = new Map<
    number,
    {
      attachment: Attachment;
      webBindingState: AttachmentWebBindingState;
    }
  >();
  let workspaceName: string | undefined;
  let mainWindow: BrowserWindow | null = null;
  const supervisor = workspaceBag.add(
    new WorkspaceSupervisor({
      boot: async (requestedWorkspaceId) => {
        if (requestedWorkspaceId !== workspaceId) {
          throw new Error(
            `Electron workspace is not registered: ${requestedWorkspaceId as string}`,
          );
        }
        const runtime = createWorkspaceRuntime({
          workspaceId,
          workspace,
          piAppDataDir,
          ...(fs.existsSync(apiModuleDir) && { apiModuleDir }),
          dependencies: {
            contentTransportRegistrar:
              resourceTransport.createRegistrar(workspaceId),
            launchProviderAuthLink: createExternalWebLinkLauncher((url) =>
              shell.openExternal(url),
            ),
          },
        });
        try {
          // One load pass activates the manifest composition in order. Invalid
          // feature entries remain structured activation failures so the host
          // can still open and the user can reload after fixing them.
          const activation = await runtime.load();
          workspaceName = activation.workspaceName;
          return runtime;
        } catch (error) {
          try {
            await runtime[Symbol.asyncDispose]();
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "Electron workspace failed to boot and clean up",
              { cause: cleanupError },
            );
          }
          throw error;
        }
      },
    }),
  );
  hostBag.add(
    resourceTransport.registerWorkspace(workspaceId, (origin) =>
      supervisor.acquire(workspaceId, origin),
    ),
  );
  hostBag.add(
    ipc.handleCanonicalRequest(Channels.request, (webContentsId, request) => {
      const connection = connectionByWebContentsId.get(webContentsId);
      if (!connection) throw new Error("Workspace window is not attached");
      return connection.attachment.prepareDispatch(request);
    }),
  );

  hostBag.add(
    ipc.handle(Channels.webBindingRead, (_req: unknown, webContentsId) => {
      const connection = connectionByWebContentsId.get(webContentsId);
      if (!connection) throw new Error("Workspace window is not attached");
      return connection.webBindingState.snapshot;
    }),
  );

  // Each BrowserWindow is one physical connection. Its lifetime owns an
  // independent workspace guard and one runtime attachment. Closing the window
  // removes only that connection. The supervisor owns runtime teardown policy.
  const openWorkspaceWindow = async (): Promise<void> => {
    if (mainWindow) return;
    const attachmentBag = hostBag.add(new DisposableBag());
    try {
      const workspaceGuard = attachmentBag.add(
        await supervisor.acquire(workspaceId, "electron-window"),
      );
      const windowAttachment = attachmentBag.add(
        await workspaceGuard.value.createAttachment({ kind: "fallback" }),
      );
      const win = openShellWindow(hostBag, {
        page: "index",
        onClosed: () => {
          mainWindow = null;
          attachmentBag[Symbol.dispose]();
        },
      });
      mainWindow = win;
      const webBindingState = attachmentBag.add(
        new AttachmentWebBindingState(windowAttachment, (snapshot) => {
          ipc.send(win, Channels.webBindingChanged, snapshot);
        }),
      );
      const connection = { attachment: windowAttachment, webBindingState };
      connectionByWebContentsId.set(win.webContents.id, connection);
      attachmentBag.add(
        disposable(() => {
          if (
            connectionByWebContentsId.get(win.webContents.id) === connection
          ) {
            connectionByWebContentsId.delete(win.webContents.id);
          }
        }),
      );
      attachmentBag.add(
        windowAttachment.onEvent((event) => {
          ipc.send(win, event.channel, event.payload, {
            describePayload: event.logOptions?.describeEvent,
          });
        }),
      );
      applyWorkspaceMenu(win);
    } catch (error) {
      attachmentBag[Symbol.dispose]();
      throw error;
    }
  };
  await openWorkspaceWindow();

  // Record the recent by manifest name (best-effort: a workspace without a
  // manifest isn't listable, and a bad manifest was already logged above).
  if (fs.existsSync(workspace.manifestPath)) {
    recents.record({
      manifestPath: workspace.manifestPath,
      name: workspaceName ?? basename(workspace.stateRoot),
    });
  }

  hostBag.add(
    onApp("activate", () => {
      void openWorkspaceWindow().catch((thrown: unknown) => {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        createLogger("main").error(
          { err: error.message, stack: error.stack },
          "workspace_window_open_failed",
        );
      });
    }),
  );
}

// Section: Workspace menu

/**
 * Route Electron menu selection through the renderer's Workspace action
 * registry. Omitting a native reload accelerator lets the confirmed
 * renderer binding own keyboard invocation and conflict policy. The launcher
 * keeps the default menu, where CmdOrCtrl+R remains a development page reload.
 */
function applyWorkspaceMenu(win: BrowserWindow): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Reload Workspace",
          click: () => {
            ipc.send(win, Channels.actionInvocation, "uix.reload");
          },
        },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  win.setMenu(Menu.buildFromTemplate(template));
}

// Section: Launcher

// The launcher owns a child lifetime because its IPC handlers must stop before
// the selected workspace boots.
function openLauncher(
  hostBag: DisposableBag,
  workspaceBag: AsyncDisposableBag,
  recents: RecentsStore,
  piAppDataDir: string,
  resourceTransport: ElectronResourceTransport,
): void {
  const launcherBag = hostBag.add(new DisposableBag());
  const win = openShellWindow(launcherBag, {
    page: "launcher",
    onClosed: () => {
      launcherBag[Symbol.dispose]();
    },
  });

  // Respond to the invoke first, then tear the launcher down and boot the
  // workspace. Disposing the handler that is currently answering would
  // race its own response.
  const transition = (target: string): void => {
    setImmediate(() => {
      launcherBag[Symbol.dispose]();
      if (!win.isDestroyed()) win.close();
      openWorkspace(
        hostBag,
        workspaceBag,
        recents,
        resolveWorkspace(target),
        piAppDataDir,
        resourceTransport,
      ).catch((thrown: unknown) => {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        createLogger("main").error(
          { err: error.message, stack: error.stack },
          "workspace_open_failed",
        );
      });
    });
  };

  launcherBag.add(
    ipc.handle<unknown, LauncherState>(Channels.launcherState, () => ({
      recents: recents.list(),
    })),
  );

  launcherBag.add(
    ipc.handle<LauncherOpenRequest, LauncherActionResult>(
      Channels.launcherOpen,
      (req) => {
        if (!fs.existsSync(req.manifestPath)) {
          return { ok: false, error: "That workspace no longer exists." };
        }
        transition(req.manifestPath);
        return { ok: true };
      },
    ),
  );

  launcherBag.add(
    ipc.handle<LauncherCreateRequest, LauncherActionResult>(
      Channels.launcherCreate,
      async (req) => {
        const result = await dialog.showOpenDialog(win, {
          title: "Choose a workspace folder",
          buttonLabel: "Use folder",
          properties: ["openDirectory", "createDirectory"],
        });
        const dir = result.filePaths[0];
        if (result.canceled || !dir) return { ok: false, canceled: true };

        // A folder that already holds a manifest is an existing workspace:
        // adopt it rather than overwriting the user's composition. The scaffolder
        // creates a fresh one with editable copies of the default features;
        // a failed dep install still opens (the broken feature lands in
        // `failed[]`), but a failed copy/write keeps the launcher up.
        const manifestPath = join(dir, WorkspaceManifestFileName);
        if (!fs.existsSync(manifestPath)) {
          const name = req.name.trim() || basename(dir);
          try {
            const { installError } = await scaffoldWorkspace({
              templatesDir: join(__dirname, "../../templates/workspace"),
              workspaceDir: dir,
              name,
            });
            if (installError) {
              createLogger("main").warn(
                { err: installError.message, workspaceDir: dir },
                "scaffold_install_failed",
              );
            }
          } catch (thrown) {
            const error =
              thrown instanceof Error ? thrown : new Error(String(thrown));
            createLogger("main").error(
              { err: error.message, workspaceDir: dir },
              "scaffold_failed",
            );
            return {
              ok: false,
              error: `Could not create the workspace: ${error.message}`,
            };
          }
        }
        transition(manifestPath);
        return { ok: true };
      },
    ),
  );
}

// Section: Application lifecycle

void app.whenReady().then(async () => {
  // Synchronous host bindings stop first during shutdown. Workspace runtimes
  // then finish their asynchronous teardown before Electron resumes quitting.
  const hostBag = new DisposableBag();
  const workspaceBag = new AsyncDisposableBag();
  const resourceTransport = new ElectronResourceTransport();
  hostBag.add(bindResourceProtocol(resourceTransport));

  app.setName("UIX");

  if (process.platform === "darwin") {
    app.dock?.setIcon(
      join(__dirname, "../../hosts/electron/assets/icon-black-large.png"),
    );
  }

  // Process-level error handlers are the catch-all for anything
  // that escapes the synchronous call stack: a feature's
  // interval throwing, a stray promise rejection in host code.
  // They go in early so they're armed before any user code runs.
  hostBag.add(installProcessHandlers(createLogger("main")));

  hostBag.add(
    onApp("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    }),
  );

  // Electron does not await lifecycle listeners. Stop ordinary host work,
  // prevent the first quit, await workspace ownership teardown, then resume.
  // This listener owns shutdown itself, so enrolling it in either bag would be
  // circular.
  let quitReady = false;
  let shutdown: Promise<void> | undefined;
  // eslint-disable-next-line no-restricted-syntax -- documented exception
  app.on("before-quit", (event) => {
    if (quitReady) return;
    event.preventDefault();
    if (shutdown) return;
    hostBag[Symbol.dispose]();
    shutdown = workspaceBag[Symbol.asyncDispose]()
      .catch((error: unknown) => {
        createLogger("main").error(
          {
            err: error instanceof Error ? error.message : String(error),
          },
          "host_shutdown_failed",
        );
      })
      .then(() => {
        quitReady = true;
        app.quit();
      });
  });

  const userDataDir = app.getPath("userData");
  const piAppDataDir = join(userDataDir, "pi");
  const recents = createRecentsStore(
    join(userDataDir, "recent-workspaces.json"),
  );

  // Which workspace? An explicit target (UIX_WORKSPACE, manifest path or
  // workspace dir) opens directly. So does a cwd that already holds a
  // manifest (the repo dev flow). Otherwise the launcher decides.
  const envTarget = process.env["UIX_WORKSPACE"];
  if (envTarget) {
    await openWorkspace(
      hostBag,
      workspaceBag,
      recents,
      resolveWorkspace(envTarget),
      piAppDataDir,
      resourceTransport,
    );
    return;
  }
  const cwdWorkspace = resolveWorkspace();
  if (fs.existsSync(cwdWorkspace.manifestPath)) {
    await openWorkspace(
      hostBag,
      workspaceBag,
      recents,
      cwdWorkspace,
      piAppDataDir,
      resourceTransport,
    );
    return;
  }
  openLauncher(hostBag, workspaceBag, recents, piAppDataDir, resourceTransport);
});
