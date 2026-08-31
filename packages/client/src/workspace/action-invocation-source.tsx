// Invokes action ids from host-owned native UI through the workspace action registry.

import type { JSX } from "react";
import { useEffect } from "react";

import type { ActionId } from "@uix/api/actions";

import { useActionRegistry } from "./action-context";
import type { ActionRegistry } from "./action-registry";

/** Host-owned native UI selections routed into the focused workspace renderer. */
export interface ActionInvocationSource {
  /** Observe action ids until the returned page-lifetime cleanup runs. */
  subscribe(handler: (actionId: ActionId) => void): () => void;
}

export function ActionInvocationListener({
  source,
}: {
  source: ActionInvocationSource;
}): JSX.Element | null {
  const registry = useActionRegistry();

  useEffect(() => {
    const binding = bindActionInvocationSource(
      registry,
      source,
      (actionId, error) => {
        window.reportError(
          new Error(`Native action failed: ${actionId}`, { cause: error }),
        );
      },
    );
    return () => {
      binding[Symbol.dispose]();
    };
  }, [registry, source]);

  return null;
}

export function bindActionInvocationSource(
  registry: ActionRegistry,
  source: ActionInvocationSource,
  onError: (actionId: ActionId, error: unknown) => void,
): Disposable {
  const unsubscribe = source.subscribe((actionId) => {
    void registry.invoke(actionId).catch((error: unknown) => {
      onError(actionId, error);
    });
  });
  return { [Symbol.dispose]: unsubscribe };
}
