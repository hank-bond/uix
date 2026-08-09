// Starts the Electron app, opens a workspace, and owns the host shell around the @uix/runtime workspace runtime.
//
// Host owns App lifecycle: the shell boots, then either opens a workspace
// directly (explicit UIX_WORKSPACE target, or a cwd that holds a manifest)
// or shows the start picker, which provides the workspace to open. One open
// workspace per App instance (v1). The workspace-bound substrate lives in the
// runtime created by `createWorkspaceRuntime`. This file wires the Electron
// adapters (IPC transport, resource protocol, openExternal, profile/api dirs)
// and the host chrome (windows, menu, picker, recents).
//
// All cleanup-requiring bindings (IPC handlers, app events, window events)
// flow through the helpers in src/main/ipc.ts and src/main/lifecycle.ts and
// land in a single `appBag`. One dispose on `will-quit` tears the whole
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

import {
  createLogger,
  createWorkspaceRuntime,
  DisposableBag,
  installProcessHandlers,
  resolveWorkspace,
  scaffoldWorkspace,
  type Workspace,
  WorkspaceManifestFileName,
} from "@uix/runtime";

import { bindExternalWebLinks } from "./external-links";
import * as ipc from "./ipc";
import { onApp, onWindow } from "./lifecycle";
import { createRecentsStore, type RecentsStore } from "./recents";
import {
  registerResourceProtocol,
  registerResourceTransportHandler,
} from "./resource-transport";
import {
  Channels,
  type PickerActionResult,
  type PickerCreateRequest,
  type PickerOpenRequest,
  type PickerState,
  type ReloadResult,
} from "../shared/ipc";

// Preflight declarations must land before app ready: the privileged substrate
// resource scheme. Manifest features are runtime contributions and load later.
registerResourceProtocol();

const isDev = !app.isPackaged;

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
  onReload: () => Promise<unknown>,
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
            void onReload();
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
 * Boot the substrate runtime against a workspace and open its window. The
 * runtime owns everything workspace-bound. This function wires the Electron
 * adapters and host chrome around it.
 */
async function openWorkspace(
  appBag: DisposableBag,
  recents: RecentsStore,
  workspace: Workspace,
  piProfileDir: string,
): Promise<void> {
  // Raw IPC payloads spill to a per-run file under the state root. Path is
  // logged as `ipc_log_file` when armed.
  ipc.initLogFile(workspace.stateRoot);

  const runtime = createWorkspaceRuntime(workspace, {
    transport: {
      registerHandler: (canonicalId, handler, logOpts) =>
        ipc.handle(canonicalId, handler, logOpts),
      publish: (canonicalId, payload, logOpts) => {
        for (const win of BrowserWindow.getAllWindows()) {
          ipc.send(win, canonicalId, payload, {
            describePayload: logOpts?.describeEvent,
          });
        }
      },
    },
    resourceTransport: registerResourceTransportHandler,
    capabilities: {
      openExternal: (url) => {
        void shell.openExternal(url);
      },
      piProfileDir,
      // Where feature value-imports of @uix/api resolve. In dev this is the
      // repo's package source. A packaged app ships the API source with the
      // feature templates (packaging arc).
      apiModuleDir: join(app.getAppPath(), "packages/api/src"),
    },
  });
  appBag.add(runtime);

  let mainWindow: BrowserWindow | null = null;
  mainWindow = openShellWindow(appBag, {
    page: "index",
    onClosed: () => {
      mainWindow = null;
    },
  });
  applyWorkspaceMenu(mainWindow, () => runtime.reload());

  const activation = await runtime.init();

  // Record the recent by manifest name (best-effort: a workspace without a
  // manifest isn't listable, and a bad manifest was already logged above).
  if (fs.existsSync(workspace.manifestPath)) {
    recents.record({
      manifestPath: workspace.manifestPath,
      name: activation.workspaceName ?? basename(workspace.stateRoot),
    });
  }

  appBag.add(
    ipc.handle<unknown, ReloadResult>(Channels.reload, () => runtime.reload()),
  );

  appBag.add(
    onApp("activate", () => {
      if (mainWindow === null) {
        mainWindow = openShellWindow(appBag, {
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
 * The start picker: a small shell window (not a feature, not a workspace
 * page) offering recents and create-new. Its IPC handlers live in a child
 * bag disposed on transition, so the workspace boot starts clean.
 */
// Section: Start picker
function openPicker(
  appBag: DisposableBag,
  recents: RecentsStore,
  piProfileDir: string,
): void {
  const pickerBag = appBag.add(new DisposableBag());
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
        appBag,
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
  // One bag for everything that lives as long as the app does.
  // Anything we register goes in here; `will-quit` disposes it.
  const appBag = new DisposableBag();

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
  appBag.add(installProcessHandlers(createLogger("main")));

  appBag.add(
    onApp("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    }),
  );

  // Dispose the whole tree on shutdown. Registered raw (not via
  // onApp) because the listener's job IS to dispose appBag. Putting
  // it in the bag would make teardown circular. The handler is a
  // one-shot process-end event with no useful moment to remove it
  // anyway, so the lack of cleanup is fine.
  // eslint-disable-next-line no-restricted-syntax -- documented exception
  app.on("will-quit", () => {
    appBag[Symbol.dispose]();
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
      appBag,
      recents,
      resolveWorkspace(envTarget),
      piProfileDir,
    );
    return;
  }
  const cwdWorkspace = resolveWorkspace();
  if (fs.existsSync(cwdWorkspace.manifestPath)) {
    await openWorkspace(appBag, recents, cwdWorkspace, piProfileDir);
    return;
  }
  openPicker(appBag, recents, piProfileDir);
});
