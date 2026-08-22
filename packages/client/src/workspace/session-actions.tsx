// Registers the workspace session actions as a feature action contribution.

import type { JSX } from "react";
import { useMemo } from "react";

import type { ActionContribution } from "@uix/api/actions";
import { useActionContribution } from "@uix/api/workspace";

import { useWorkspaceSessionController } from "./session-context";

interface CreateWorkspaceSessionActionsOptions {
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
            await opts.newSession();
          },
        },
      },
    },
  };
}

export function WorkspaceSessionActions(): JSX.Element | null {
  const controller = useWorkspaceSessionController();
  const actions = useMemo(
    () =>
      createWorkspaceSessionActions({
        newSession: () => controller.newSession(),
      }),
    [controller],
  );
  useActionContribution(actions);
  return null;
}
