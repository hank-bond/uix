// workspace layout manifest.
//
// Declares which surfaces are active and their order. Surface definitions
// live with their features; the workspace imports and composes them.
// Channel clients are created by the surface host, not by features.

import { useMemo } from "react";

import { chatSurface } from "#features/chat/workspace/surface";
import { canvasSurface } from "#features/canvas/workspace/surface";
import { useWorkspaceClient } from "./context";
import {
  createChannelClient,
  type SurfaceContribution,
} from "@uix/api/workspace";

export const workspaceId = "local";

export const layout: readonly SurfaceContribution[] = [
  chatSurface,
  canvasSurface,
];

/** Creates the typed channel client and passes it to the surface render. */
export function SurfaceMount({ surface }: { surface: SurfaceContribution }) {
  const workspace = useWorkspaceClient();
  // Memoized so surface effects keyed on the client don't tear down and
  // re-run (resubscribing, re-fetching history) every workspace render.
  const client = useMemo(
    () =>
      surface.featureId && surface.contract
        ? createChannelClient(workspace, surface.featureId, surface.contract)
        : undefined,
    [workspace, surface],
  );
  return <>{surface.render(client)}</>;
}
