import { useMemo } from "react";

import type { ActionContribution } from "@uix/api/actions";
import { useActionContribution } from "@uix/api/workspace";

import { useWorkspaceSessionController } from "./session-context";

interface CreateWorkspaceSessionActionsOptions {
  isAgentRunning: () => boolean;
  newSession: () => Promise<unknown>;
}

export function createWorkspaceSessionActions(
  opts: CreateWorkspaceSessionActionsOptions,
): ActionContribution {
  return {
    session: {
      title: "Session",
      children: {
        new: {
          title: "New Session",
          description: "Start a fresh conversation",
          defaultBinding: "mod+n",
          run: async () => {
            if (opts.isAgentRunning()) return;
            await opts.newSession();
          },
        },
      },
    },
  };
}

export function WorkspaceSessionActions() {
  const controller = useWorkspaceSessionController();
  const actions = useMemo(
    () =>
      createWorkspaceSessionActions({
        isAgentRunning: () => controller.isAgentRunning(),
        newSession: () => controller.newSession(),
      }),
    [controller],
  );
  useActionContribution(actions);
  return null;
}
