// Synchronizes confirmed keybindings between the action registry and the substrate keybindings channel.

import type { JSX } from "react";
import { useEffect, useMemo } from "react";

import type { KeybindingMap } from "@uix/api/actions";
import {
  type ChannelClient,
  createChannelClient,
  useWorkspaceClient,
} from "@uix/api/workspace";
import { uixChannels } from "#shared/ipc";

import { useActionRegistry } from "./action-context";
import type { ActionRegistry } from "./action-registry";

type UixChannelClient = ChannelClient<typeof uixChannels>;

export function KeybindingSync(): JSX.Element | null {
  const workspace = useWorkspaceClient();
  const registry = useActionRegistry();
  const client = useMemo(
    () => createChannelClient(workspace, uixChannels),
    [workspace],
  );

  useEffect(() => {
    const binding = bindKeybindingSync(registry, client);
    return () => {
      binding[Symbol.dispose]();
    };
  }, [client, registry]);

  return null;
}

export function bindKeybindingSync(
  registry: ActionRegistry,
  client: UixChannelClient,
): Disposable {
  let active = true;
  let reconciliationQueued = false;
  let requestVersion = 0;
  let eventVersion = 0;

  const acceptPublishedBindings = (bindings: KeybindingMap): void => {
    if (!active) return;
    eventVersion += 1;
    registry.setConfirmedBindings(bindings);
  };

  const reconcileDefaults = (): void => {
    if (!active || reconciliationQueued) return;
    reconciliationQueued = true;
    queueMicrotask(() => {
      reconciliationQueued = false;
      if (!active) return;
      const requestedAtEventVersion = eventVersion;
      const currentRequestVersion = ++requestVersion;
      const defaults = { ...registry.getDefaultBindingsSnapshot() };
      void client.requests
        .reconcile_keybindings(defaults)
        .then((confirmed) => {
          if (
            active &&
            currentRequestVersion === requestVersion &&
            requestedAtEventVersion === eventVersion
          ) {
            registry.setConfirmedBindings(confirmed);
          }
        })
        .catch(() => undefined);
    });
  };

  const unsubscribeBindings = client.events.keybindings_changed(
    acceptPublishedBindings,
  );
  const unsubscribeSurfaces = client.events.surfaces_changed(reconcileDefaults);
  const unsubscribeDefaults =
    registry.subscribeToDefaultBindings(reconcileDefaults);
  reconcileDefaults();

  return {
    [Symbol.dispose]() {
      if (!active) return;
      active = false;
      requestVersion += 1;
      unsubscribeDefaults();
      unsubscribeSurfaces();
      unsubscribeBindings();
    },
  };
}
