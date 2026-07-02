// workspace surface composition.
//
// The surface list is registry-driven: the substrate's `uix.surfaces`
// channel lists what the loaded features contributed, and the page
// re-fetches on `surfaces_changed` (fired after every load pass, so
// /reload updates the composition live). Every surface — chat and canvas
// included — is dynamic-imported from its content-hash-busted
// substrate-origin URL; a failing surface renders an error card — the
// frontend twin of the loader's `failed[]` — without taking down the
// workspace. Surface definitions live with their features; channel
// clients are created by the surface host, not by feature code.

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";

import { uixChannels, type SurfaceEntry } from "#shared/ipc";
import {
  createChannelClient,
  useWorkspaceClient,
  type SurfaceContribution,
} from "@uix/api/workspace";

/** The composed surface list, in composition (manifest) order. */
export function useSurfaces(): readonly SurfaceEntry[] {
  const workspace = useWorkspaceClient();
  const client = useMemo(
    () => createChannelClient(workspace, uixChannels),
    [workspace],
  );
  const [surfaces, setSurfaces] = useState<readonly SurfaceEntry[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void client.requests.surfaces(undefined).then((res) => {
        if (alive) setSurfaces(res.surfaces);
      });
    };
    refresh();
    const unsubscribe = client.subscriptions.surfaces_changed(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [client]);

  return surfaces;
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

interface RuntimeSurfaceState {
  name: string;
  body: ReactNode;
}

/**
 * Loads a runtime surface entry: dynamic-imports the pipeline-built module,
 * validates its default export, and mounts it behind an error boundary.
 * Returns the pane name (the module's, once loaded) plus the body to render.
 */
export function useRuntimeSurface(entry: SurfaceEntry): RuntimeSurfaceState {
  const [loaded, setLoaded] = useState<
    { surface: SurfaceContribution } | { error: string } | undefined
  >(undefined);

  useEffect(() => {
    if (entry.error !== undefined || entry.url === undefined) return;
    let alive = true;
    import(/* @vite-ignore */ entry.url).then(
      (module: { default?: unknown }) => {
        if (!alive) return;
        try {
          setLoaded({ surface: validateSurfaceContribution(module.default) });
        } catch (thrown) {
          setLoaded({
            error: thrown instanceof Error ? thrown.message : String(thrown),
          });
        }
      },
      (thrown: unknown) => {
        if (alive) setLoaded({ error: String(thrown) });
      },
    );
    return () => {
      alive = false;
    };
  }, [entry]);

  const buildFailure =
    entry.error ??
    (entry.url === undefined ? "No module URL for this surface." : undefined);
  if (buildFailure !== undefined) {
    return {
      name: entry.featureId,
      body: <SurfaceErrorCard entry={entry} message={buildFailure} />,
    };
  }
  if (loaded === undefined) {
    return { name: entry.featureId, body: undefined };
  }
  if ("error" in loaded) {
    return {
      name: entry.featureId,
      body: <SurfaceErrorCard entry={entry} message={loaded.error} />,
    };
  }
  return {
    name: loaded.surface.name,
    body: (
      <SurfaceErrorBoundary entry={entry}>
        <SurfaceMount surface={loaded.surface} />
      </SurfaceErrorBoundary>
    ),
  };
}

/**
 * Narrows a module's default export to a SurfaceContribution or throws
 * with a message that names what's wrong — loaded code is validated, not
 * trusted, mirroring the backend loader's `validateFeatureDefinition`.
 */
function validateSurfaceContribution(value: unknown): SurfaceContribution {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      "Default export is not a surface (expected a defineSurface result).",
    );
  }
  const surface = value as Partial<SurfaceContribution>;
  if (typeof surface.name !== "string") {
    throw new Error(
      "Surface has no name — export default defineSurface({ name, ... }).",
    );
  }
  if (typeof surface.render !== "function") {
    throw new Error(`Surface ${surface.name} has no render() function.`);
  }
  return surface as SurfaceContribution;
}

function SurfaceErrorCard({
  entry,
  message,
}: {
  entry: SurfaceEntry;
  message: string;
}) {
  return (
    <div className="surface-error" role="alert">
      <p className="surface-error__title">
        Surface failed: <code>{entry.featureId}</code>
      </p>
      <p className="surface-error__detail">{message}</p>
      <p className="surface-error__entry">
        Feature located at: <code>`{entry.entry}`</code> fix the source and
        /reload.
      </p>
    </div>
  );
}

/** Render-time throws land here instead of unmounting the workspace. */
class SurfaceErrorBoundary extends Component<
  { entry: SurfaceEntry; children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <SurfaceErrorCard
          entry={this.props.entry}
          message={this.state.error.message}
        />
      );
    }
    return this.props.children;
  }
}
