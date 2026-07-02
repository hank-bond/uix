// workspace surface composition.
//
// The surface list is registry-driven: the substrate's `uix.surfaces`
// channel lists what the loaded features contributed, and the page
// re-fetches on `surfaces_changed` (fired after every load pass, so
// /reload updates the composition live). Surface definitions live with
// their features; channel clients are created by the surface host, not
// by features.

import { useEffect, useMemo, useState } from "react";

import chatSurface from "#features/chat/workspace/surface";
import canvasSurface from "#features/canvas/workspace/surface";
import { uixChannels, type SurfaceEntry } from "#shared/ipc";
import { useWorkspaceClient } from "./context";
import {
  createChannelClient,
  type SurfaceContribution,
} from "@uix/api/workspace";

// Temporary static tail: chat/canvas still compile into the page until the
// surface module pipeline (S2) lets them load like any manifest feature
// (S4), at which point these imports die with bundled.ts. They come first
// because bundled features activate before manifest entries.
const staticSurfaces: readonly SurfaceContribution[] = [
  chatSurface,
  canvasSurface,
];

// S2 replaces this placeholder with a dynamic import of the entry's
// compiled module (and an error card when that fails). Until then a
// registry-listed surface renders as an inert marker naming its source.
function placeholderSurface(entry: SurfaceEntry): SurfaceContribution {
  return {
    name: entry.featureId,
    render: () => (
      <p className="surface-placeholder">
        {entry.featureId} contributed {entry.entry} — surface modules load once
        the pipeline lands (S2).
      </p>
    ),
  };
}

/** The composed surface list: static tail plus registry contributions. */
export function useSurfaces(): readonly SurfaceContribution[] {
  const workspace = useWorkspaceClient();
  const client = useMemo(
    () => createChannelClient(workspace, uixChannels),
    [workspace],
  );
  const [runtime, setRuntime] = useState<readonly SurfaceEntry[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void client.requests.surfaces(undefined).then((res) => {
        if (alive) setRuntime(res.surfaces);
      });
    };
    refresh();
    const unsubscribe = client.subscriptions.surfaces_changed(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [client]);

  return useMemo(
    () => [...staticSurfaces, ...runtime.map(placeholderSurface)],
    [runtime],
  );
}

/** Creates the typed channel client and passes it to the surface render. */
export function SurfaceMount({ surface }: { surface: SurfaceContribution }) {
  const workspace = useWorkspaceClient();
  // Memoized so surface effects keyed on the client don't tear down and
  // re-run (resubscribing, re-fetching history) every workspace render.
  const client = useMemo(
    () =>
      surface.contract
        ? createChannelClient(workspace, surface.contract)
        : undefined,
    [workspace, surface],
  );

  // A surface's sheets apply only while it is mounted — unmount (or a
  // reload that drops the surface) removes them, so styles can't leak
  // across composition changes.
  useEffect(() => {
    const sheets = surface.styles;
    if (!sheets?.length) return;
    document.adoptedStyleSheets.push(...sheets);
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => !sheets.includes(sheet),
      );
    };
  }, [surface]);

  return <>{surface.render(client)}</>;
}
