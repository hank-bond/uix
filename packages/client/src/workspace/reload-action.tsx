// Registers Workspace reload as a substrate-owned renderer action.

import type { JSX } from "react";
import { useMemo } from "react";

import type { ActionContribution } from "@uix/api/actions";
import {
  type ReloadResult,
  substrateChannels,
} from "@uix/api/substrate-channels";
import {
  createChannelClient,
  useActionContribution,
  useWorkspaceClient,
} from "@uix/api/workspace";

interface CreateWorkspaceReloadActionOptions {
  reload: () => Promise<ReloadResult>;
}

export function createWorkspaceReloadAction(
  opts: CreateWorkspaceReloadActionOptions,
): ActionContribution {
  return {
    reload: {
      title: "Reload Workspace",
      description: "Reload feature source and the active workspace composition",
      defaultBinding: "mod+r",
      run: async () => {
        await opts.reload();
      },
    },
  };
}

export function WorkspaceReloadAction(): JSX.Element | null {
  const workspace = useWorkspaceClient();
  const client = useMemo(
    () => createChannelClient(workspace, "uix", substrateChannels),
    [workspace],
  );
  const actions = useMemo(
    () =>
      createWorkspaceReloadAction({
        reload: () => client.requests.reload(undefined),
      }),
    [client],
  );
  useActionContribution(actions);
  return null;
}
