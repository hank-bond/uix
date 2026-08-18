// Adapts Electron launcher IPC to the shared launcher's host capabilities.

import type {
  LauncherActionOutcome,
  LauncherAdapter,
} from "@uix/client/launcher";
import {
  Channels,
  type ChannelTransport,
  type LauncherActionResult,
  type LauncherState,
} from "#shared/ipc";

/** Construct the launcher adapter exposed by the Electron preload transport. */
export function createElectronLauncherAdapter(
  transport: ChannelTransport,
): LauncherAdapter {
  return {
    async listWorkspaces() {
      const state = (await transport.request(
        Channels.launcherState,
        undefined,
      )) as LauncherState;
      return state.recents.map((recent) => ({
        id: recent.manifestPath,
        name: recent.name,
        description: recent.manifestPath,
      }));
    },
    async openWorkspace(workspaceId) {
      const result = (await transport.request(Channels.launcherOpen, {
        manifestPath: workspaceId,
      })) as LauncherActionResult;
      return toLauncherOutcome(result);
    },
    async createWorkspace({ name }) {
      const result = (await transport.request(Channels.launcherCreate, {
        name,
      })) as LauncherActionResult;
      return toLauncherOutcome(result);
    },
  };
}

function toLauncherOutcome(
  result: LauncherActionResult,
): LauncherActionOutcome {
  if (result.ok) return "accepted";
  if (result.error) throw new Error(result.error);
  return "canceled";
}
