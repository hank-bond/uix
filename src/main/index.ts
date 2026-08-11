// Starts the Electron host, opens a workspace, and owns the lifetimes of its windows and host chrome.
//
// Owns the host lifecycle: the shell boots, then either opens a workspace
// directly (explicit UIX_WORKSPACE target, or a cwd that holds a manifest)
// or shows the start picker, which provides the workspace to open. One
// open workspace per host instance (v1).
//
// The workspace substrate itself lives in `@uix/runtime`: openWorkspace()
// constructs one workspace runtime over Electron ports (the IPC channel
// transport, the resource protocol transport, shell.openExternal) and keeps
// only host chrome here: the window, the menu, the picker, recents, and the
// reload IPC channel.
//
// All cleanup-requiring bindings (IPC handlers, app events, window events)
// flow through the helpers in src/main/ipc.ts and src/main/lifecycle.ts and
// land in a single `hostBag`. One dispose on `will-quit` tears the whole
// tree down. See docs/architecture/conventions/lifetimes.md.

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

import type { ReloadResult } from "@uix/api/substrate-channels";
import { createWorkspaceRuntime, toWorkspaceId } from "@uix/runtime";
import { WorkspaceManifestFileName } from "@uix/runtime/features/manifest";
import { installProcessHandlers } from "@uix/runtime/lifecycle";
import { createLogger } from "@uix/runtime/log";
import { resolveWorkspace, type Workspace } from "@uix/runtime/roots";

import { bindExternalWebLinks } from "./external-links";
import * as ipc from "./ipc";
import { DisposableBag, onApp, onWindow } from "./lifecycle";
import { createRecentsStore, type RecentsStore } from "./recents";
import {
  createElectronResourceTransport,
  registerResourceProtocol,
} from "./resource-transport";
import { scaffoldWorkspace } from "./scaffold";
import {
  Channels,
  type PickerActionResult,
  type PickerCreateRequest,
  type PickerOpenRequest,
  type PickerState,
} from "../shared/ipc";

const isDev = !app.isPackaged;
const LocalWorkspaceId = "local";

// Preflight declarations must land before app ready. Today that's just the
// substrate resource protocol (the loader loads no feature this early. Manifest
// features are runtime contributions by definition).
registerResourceProtocol();

interface OpenShellWindowOptions {
  page: "index" | "picker";
  onClosed?: () => void;
}

// Section: Shell window
function openShellWindow(
  parentLifetime: DisposableBag,
  options: OpenShellWindowOptions,
): BrowserWindow {
  const size =
    options.page === "picker"
      ? { width: 560, height: 480, resizable: false }
      : { width: 1100, height: 720 };
  const win = new BrowserWindow({
    ...size,
    title: "UIX",
    icon: join(__dirname, "../../src/shared/assets/icon-black-large.png"),
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
      options.page === "picker" ? `${devUrl}/picker.html` : devUrl,
    );
  } else {
    void win.loadFile(join(__dirname, `../renderer/${options.page}.html`));
  }

  return win;
}

/**
 * Boot the substrate against a workspace and open its window. Everything
 * workspace-bound (state root, feature composition, agent sessions, reload
 * coordination) lives in the workspace runtime constructed here. The shell
 * above it only decides *which* workspace to open and supplies the dependencies.
 */
async function openWorkspace(
  hostBag: DisposableBag,
  recents: RecentsStore,
  workspace: Workspace,
  piProfileDir: string,
): Promise<void> {
  // Raw IPC payloads spill to a per-run file under the state root. Path is
  // logged as `ipc_log_file` when armed.
  ipc.initLogFile(workspace.stateRoot);

  const apiModuleDir = join(app.getAppPath(), "packages/api/src");
  const runtime = createWorkspaceRuntime({
    workspaceId: toWorkspaceId(LocalWorkspaceId),
    workspace,
    piProfileDir,
    ...(fs.existsSync(apiModuleDir) && { apiModuleDir }),
    dependencies: {
      channelTransport: {
        transportRegistrar(canonicalId, handler, logOpts) {
          return ipc.handle(canonicalId, handler, logOpts);
        },
        publish(channel, payload, logOpts) {
          for (const win of BrowserWindow.getAllWindows()) {
            ipc.send(win, channel, payload, {
              describePayload: logOpts?.describeEvent,
            });
          }
        },
      },
      resourceTransport: createElectronResourceTransport(),
      openExternal: (url) => shell.openExternal(url),
    },
  });
  hostBag.add(runtime);

  let mainWindow: BrowserWindow | null = null;
  mainWindow = openShellWindow(hostBag, {
    page: "index",
    onClosed: () => {
      mainWindow = null;
    },
  });
  applyWorkspaceMenu(mainWindow, () => runtime.reload());

  // One load pass activates the whole composition, the manifest's entries,
  // in manifest order. A bad manifest must not brick the host: the runtime
  // logs it loudly and boots with no features. The user can then fix the
  // manifest and reload.
  const initialActivation = await runtime.load();

  // Record the recent by manifest name (best-effort: a workspace without a
  // manifest isn't listable, and a bad manifest was already logged above).
  if (fs.existsSync(workspace.manifestPath)) {
    recents.record({
      manifestPath: workspace.manifestPath,
      name: initialActivation.workspaceName ?? basename(workspace.stateRoot),
    });
  }

  hostBag.add(
    ipc.handle<unknown, ReloadResult>(Channels.reload, () => runtime.reload()),
  );

  hostBag.add(
    onApp("activate", () => {
      if (mainWindow === null) {
        mainWindow = openShellWindow(hostBag, {
          page: "index",
          onClosed: () => {
            mainWindow = null;
          },
        });
        applyWorkspaceMenu(mainWindow, () => runtime.reload());
      }
    }),
  );
}

/**
 * Electron-host chrome: the workspace window menu binds CmdOrCtrl+R to the
 * workspace reload. The default menu's reload role would page-reload the
 * renderer instead, which skips feature and Pi resource replacement. The
 * workspace reload re-reads manifests and rebuilds surface modules from disk
 * every pass, so it needs no cache-busting sibling and leaves no page-reload
 * escape hatch. Host-specific by design so the future Electron/web host
 * split can hoist or replace it. The picker window keeps the default menu
 * (CmdOrCtrl+R is a page reload there, useful in dev).
 */
function applyWorkspaceMenu(
  win: BrowserWindow,
  runWorkspaceReload: () => Promise<ReloadResult>,
): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Reload Workspace",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            void runWorkspaceReload();
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

/**
 * The start picker: a small shell window (not a feature, not a workspace
 * page) offering recents and create-new. Its IPC handlers live in a child
 * bag disposed on transition, so the workspace boot starts clean.
 */
// Section: Start picker
function openPicker(
  hostBag: DisposableBag,
  recents: RecentsStore,
  piProfileDir: string,
): void {
  const pickerBag = hostBag.add(new DisposableBag());
  const win = openShellWindow(pickerBag, {
    page: "picker",
    onClosed: () => {
      pickerBag[Symbol.dispose]();
    },
  });

  // Respond to the invoke first, then tear the picker down and boot the
  // workspace. Disposing the handler that is currently answering would
  // race its own response.
  const transition = (target: string): void => {
    setImmediate(() => {
      pickerBag[Symbol.dispose]();
      if (!win.isDestroyed()) win.close();
      openWorkspace(
        hostBag,
        recents,
        resolveWorkspace(target),
        piProfileDir,
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

  pickerBag.add(
    ipc.handle<unknown, PickerState>(Channels.pickerState, () => ({
      recents: recents.list(),
    })),
  );

  pickerBag.add(
    ipc.handle<PickerOpenRequest, PickerActionResult>(
      Channels.pickerOpen,
      (req) => {
        if (!fs.existsSync(req.manifestPath)) {
          return { ok: false, error: "That workspace no longer exists." };
        }
        transition(req.manifestPath);
        return { ok: true };
      },
    ),
  );

  pickerBag.add(
    ipc.handle<PickerCreateRequest, PickerActionResult>(
      Channels.pickerCreate,
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
        // `failed[]`), but a failed copy/write keeps the picker up.
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

void app.whenReady().then(async () => {
  // One bag for everything that lives as long as the host does.
  // Anything we register goes in here; `will-quit` disposes it.
  const hostBag = new DisposableBag();

  app.setName("UIX");

  if (process.platform === "darwin") {
    app.dock?.setIcon(
      join(__dirname, "../../src/shared/assets/icon-black-large.png"),
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

  // Dispose the whole tree on shutdown. Registered raw (not via
  // onApp) because the listener's job IS to dispose hostBag. Putting
  // it in the bag would make teardown circular. The handler is a
  // one-shot process-end event with no useful moment to remove it
  // anyway, so the lack of cleanup is fine.
  // eslint-disable-next-line no-restricted-syntax -- documented exception
  app.on("will-quit", () => {
    hostBag[Symbol.dispose]();
  });

  const userDataDir = app.getPath("userData");
  const piProfileDir = join(userDataDir, "pi");
  const recents = createRecentsStore(
    join(userDataDir, "recent-workspaces.json"),
  );

  // Which workspace? An explicit target (UIX_WORKSPACE, manifest path or
  // workspace dir) opens directly. So does a cwd that already holds a
  // manifest (the repo dev flow). Otherwise the start picker decides.
  const envTarget = process.env["UIX_WORKSPACE"];
  if (envTarget) {
    await openWorkspace(
      hostBag,
      recents,
      resolveWorkspace(envTarget),
      piProfileDir,
    );
    return;
  }
  const cwdWorkspace = resolveWorkspace();
  if (fs.existsSync(cwdWorkspace.manifestPath)) {
    await openWorkspace(hostBag, recents, cwdWorkspace, piProfileDir);
    return;
  }
  openPicker(hostBag, recents, piProfileDir);
});
