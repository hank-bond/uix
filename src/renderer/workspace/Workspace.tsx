// workspace surface composition.
//
// Renders the composed surface list from useSurfaces(). Each surface
// provides a render function; the workspace composes them into a persisted
// horizontal resize row. Channel clients are created by SurfaceMount, not by
// feature code. An empty composition renders an explanatory card instead of a
// blank window — which of the two empty states (no manifest vs. no surfaces)
// it names, so the create-manifest-after-boot flow is visible instead of dark.

import { Fragment, useMemo, type ReactNode } from "react";
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizablePanelSeparator,
  useDefaultLayout,
} from "react-resizable-panels";

import {
  useRuntimeSurface,
  useSurfaces,
  type SurfaceComposition,
} from "./layout";
import type { SurfaceEntry } from "#shared/ipc";
import { FeatureActionsProvider } from "@uix/api/workspace";
import { ActionRegistry } from "./action-registry";
import { ActionRegistryProvider } from "./action-context";
import { ActionKeyboardDispatcher } from "./action-keyboard-dispatcher";
import { KeybindingSync } from "./keybinding-sync";
import { WorkspaceSessionActions } from "./session-actions";
import { WorkspaceSessionControllerProvider } from "./session-context";
import { toShortcutPlatform } from "./shortcut-platform";

const actionRegistry = new ActionRegistry({
  shortcutPlatform: toShortcutPlatform(navigator),
});
const registerWorkspaceActions = actionRegistry.forFeature("uix");

export function Workspace() {
  return (
    <ActionRegistryProvider registry={actionRegistry}>
      <FeatureActionsProvider register={registerWorkspaceActions}>
        <WorkspaceSessionControllerProvider>
          <WorkspaceSessionActions />
          <ActionKeyboardDispatcher />
          <KeybindingSync />
          <WorkspaceContent />
        </WorkspaceSessionControllerProvider>
      </FeatureActionsProvider>
    </ActionRegistryProvider>
  );
}

function WorkspaceContent() {
  const composition = useSurfaces();
  // Not yet fetched — render the bare shell, no empty-state flash.
  if (!composition) return <div className="workspace" />;
  if (composition.surfaces.length === 0) {
    return (
      <div className="workspace workspace--empty">
        <EmptyWorkspaceCard composition={composition} />
      </div>
    );
  }

  return (
    <div className="workspace">
      <ResizableSurfaceRow composition={composition} />
    </div>
  );
}

function ResizableSurfaceRow({
  composition,
}: {
  composition: SurfaceComposition;
}) {
  const panelIds = useMemo(
    () => composition.surfaces.map(surfacePanelId),
    [composition.surfaces],
  );
  const savedLayout = useDefaultLayout({
    id: `uix:surface-layout:${composition.manifestPath}`,
    panelIds,
    onlySaveAfterUserInteractions: true,
  });

  return (
    <ResizablePanelGroup
      key={panelIds.join("|")}
      className="workspace-panels"
      orientation="horizontal"
      defaultLayout={savedLayout.defaultLayout}
      onLayoutChanged={savedLayout.onLayoutChanged}
    >
      {composition.surfaces.map((entry, i) => {
        const panelId = panelIds[i];
        return (
          <Fragment key={entry.url ?? panelId}>
            {i > 0 ? (
              <ResizablePanelSeparator
                id={`${panelId}:resize-separator`}
                className="workspace-resize-separator"
              />
            ) : undefined}
            <ResizablePanel id={panelId} minSize="14rem">
              <RuntimeSurfacePanel entry={entry} />
            </ResizablePanel>
          </Fragment>
        );
      })}
    </ResizablePanelGroup>
  );
}

function surfacePanelId(entry: SurfaceEntry): string {
  return `surface-${encodeURIComponent(entry.featureId)}-${encodeURIComponent(entry.entry)}`;
}

function EmptyWorkspaceCard({
  composition,
}: {
  composition: SurfaceComposition;
}) {
  return (
    <div className="workspace-empty">
      <p className="workspace-empty__title">
        {composition.manifestFound
          ? "No feature surfaces in this workspace"
          : "This folder has no workspace manifest"}
      </p>
      <p className="workspace-empty__detail">
        {composition.manifestFound
          ? "The manifest loaded no surface contributions — add feature entries (or check the logs for failed features), then reload."
          : "Create the manifest listing feature entry files, then reload."}
      </p>
      <p className="workspace-empty__path">
        <code>{composition.manifestPath}</code>
      </p>
    </div>
  );
}

function SurfacePanel({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`surface-panel surface-panel--${name}`}
      data-uix-surface={name}
      aria-label={name}
    >
      <header className="surface-panel__header">{name}</header>
      <div className={`surface-panel__body surface-panel__body--${name}`}>
        {children}
      </div>
    </section>
  );
}

function RuntimeSurfacePanel({ entry }: { entry: SurfaceEntry }) {
  const { name, body } = useRuntimeSurface(entry);
  return <SurfacePanel name={name}>{body}</SurfacePanel>;
}
