// Hosts runtime surfaces: fetches the composition, loads surface modules, and mounts them with clients, scoped styles, and error boundaries.
//
// The surface list is registry-driven: the substrate's `uix.surfaces`
// channel lists what the active feature instances contributed, and the page
// re-fetches on `surfaces_changed` (fired after every load pass, so
// /reload updates the composition live). Every surface, chat and canvas
// included, is dynamic-imported from its content-hash-busted
// substrate-origin URL. A failing surface renders an error card, the
// frontend twin of the loader's `failed[]`, without taking down the
// workspace. Surface definitions live with their features. The surface
// host creates channel clients, not feature code.

import type { JSX } from "react";
import { Component, type ReactNode, useEffect, useMemo, useState } from "react";

import {
  createChannelClient,
  createFeatureSettingsClient,
  FeatureActionsProvider,
  FeatureSettingsProvider,
  type SurfaceContribution,
  useWorkspaceClient,
} from "@uix/api/workspace";
import { substrateChannels, type SurfaceEntry } from "#shared/ipc";

import { useActionRegistry } from "./action-context";

/** The composed surface list plus where it came from (or didn't). */
export interface SurfaceComposition {
  surfaces: readonly SurfaceEntry[];
  manifestPath: string;
  manifestFound: boolean;
}

/**
 * The composition, in manifest order; `undefined` until the first fetch
 * resolves so an empty-state card doesn't flash during boot.
 */
export function useSurfaces(): SurfaceComposition | undefined {
  const workspace = useWorkspaceClient();
  const client = useMemo(
    () => createChannelClient(workspace, substrateChannels),
    [workspace],
  );
  const [composition, setComposition] = useState<
    SurfaceComposition | undefined
  >(undefined);

  useEffect(() => {
    let alive = true;
    let requestVersion = 0;
    const refresh = (): void => {
      const version = ++requestVersion;
      void client.requests
        .surfaces(undefined)
        .then((res) => {
          if (alive && version === requestVersion) setComposition(res);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = client.events.surfaces_changed(refresh);
    return () => {
      alive = false;
      requestVersion += 1;
      unsubscribe();
    };
  }, [client]);

  return composition;
}

/** Creates feature-bound clients and mounts the surface runtime context. */
export function SurfaceMount({
  entry,
  surface,
}: {
  entry: SurfaceEntry;
  surface: SurfaceContribution;
}): JSX.Element {
  const workspace = useWorkspaceClient();
  const actionRegistry = useActionRegistry();
  const registerActions = useMemo(
    () => actionRegistry.forFeature(entry.featureId),
    [actionRegistry, entry.featureId],
  );
  // Memoized so surface effects keyed on the client don't tear down and
  // re-run (resubscribing, re-fetching history) every workspace render.
  const client = useMemo(
    () =>
      surface.contract
        ? createChannelClient(workspace, surface.contract)
        : undefined,
    [workspace, surface],
  );
  const settings = useMemo(
    () => createFeatureSettingsClient(workspace, entry.featureId),
    [workspace, entry.featureId],
  );

  // A surface's sheets apply only while it is mounted. Unmount (or a
  // reload that drops the surface) removes them, so styles can't leak
  // across composition changes. Adoption also wraps every sheet in the
  // surface's @scope, so containment is structural rather than an authoring
  // convention (see scopeToSurface).
  useEffect(() => {
    const sheets = surface.styles;
    if (!sheets?.length) return;
    const scoped = sheets.map((sheet) => scopeToSurface(sheet, surface.name));
    document.adoptedStyleSheets.push(...scoped);
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => !scoped.includes(sheet),
      );
    };
  }, [surface]);

  return (
    <FeatureActionsProvider register={registerActions}>
      <FeatureSettingsProvider client={settings}>
        {surface.render(client)}
      </FeatureSettingsProvider>
    </FeatureActionsProvider>
  );
}

/**
 * Rebuild a surface's sheet with every rule wrapped in
 * `@scope ([data-uix-surface="<name>"])`, so feature CSS cannot style other
 * surfaces or the host chrome no matter how the author writes its selectors.
 * Feature authors write plain selectors. The substrate owns containment.
 *
 * Name-global at-rules (@font-face, @keyframes, @property) escape the
 * wrap: scoping cannot contain them. Their names are document-global by
 * CSS's design, and CSS ignores them inside @scope. Collisions
 * there remain a (documented) naming responsibility.
 *
 * The scope root is the surface panel element, which itself is in scope;
 * selectors that still spell the old `[data-uix-surface="…"]` prefix keep
 * matching, so pre-scoping feature CSS works unchanged.
 */
function scopeToSurface(sheet: CSSStyleSheet, name: string): CSSStyleSheet {
  const global: string[] = [];
  const scoped: string[] = [];
  for (const rule of Array.from(sheet.cssRules)) {
    if (
      rule instanceof CSSFontFaceRule ||
      rule instanceof CSSKeyframesRule ||
      rule instanceof CSSPropertyRule
    ) {
      global.push(rule.cssText);
    } else {
      scoped.push(rule.cssText);
    }
  }
  const out = new CSSStyleSheet();
  // defineSurface validates surface names as id tokens, so the attribute
  // value needs no escaping.
  out.replaceSync(
    `${global.join("\n")}\n@scope ([data-uix-surface="${name}"]) {\n${scoped.join("\n")}\n}`,
  );
  return out;
}

interface RuntimeSurfaceState {
  name: string;
  body: ReactNode;
}

/**
 * Loads a runtime surface entry: dynamic-imports the pipeline-built module,
 * validates its `surface` export, and mounts it behind an error boundary.
 * Returns the surface name (the module's, once loaded) plus the body to render.
 */
export function useRuntimeSurface(entry: SurfaceEntry): RuntimeSurfaceState {
  const [loaded, setLoaded] = useState<
    { surface: SurfaceContribution } | { error: string } | undefined
  >(undefined);

  useEffect(() => {
    if (entry.error !== undefined || entry.url === undefined) return;
    let alive = true;
    import(/* @vite-ignore */ entry.url).then(
      (module: { surface?: unknown }) => {
        if (!alive) return;
        try {
          setLoaded({ surface: validateSurfaceContribution(module.surface) });
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
        <SurfaceMount entry={entry} surface={loaded.surface} />
      </SurfaceErrorBoundary>
    ),
  };
}

/**
 * Narrows a module's `surface` export to a SurfaceContribution or throws
 * with a message that names what's wrong. It validates loaded code rather
 * than trusting it, mirroring the backend loader's `validateFeatureDefinition`.
 */
function validateSurfaceContribution(value: unknown): SurfaceContribution {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      "Surface module does not export `surface` (expected a defineSurface result).",
    );
  }
  const surface = value as Partial<SurfaceContribution>;
  if (typeof surface.name !== "string") {
    throw new Error(
      "Surface has no name; export const surface = defineSurface({ name, ... }).",
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
}): JSX.Element {
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

  static getDerivedStateFromError(error: Error): { error?: Error } {
    return { error };
  }

  render(): ReactNode {
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
