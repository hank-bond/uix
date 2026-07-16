import { useEffect } from "react";

import { useActionRegistry } from "./action-context";
import type { ActionRegistry } from "./action-registry";
import { asResolvedShortcutFromKeyboardEvent } from "./keyboard-event-shortcut";

interface KeyboardEventTarget {
  addEventListener(
    type: "keydown",
    listener: (event: KeyboardEvent) => void,
  ): void;
  removeEventListener(
    type: "keydown",
    listener: (event: KeyboardEvent) => void,
  ): void;
}

export function ActionKeyboardDispatcher() {
  const registry = useActionRegistry();

  useEffect(() => {
    const unsubscribeDiagnostics = registry.subscribeToInvocationDiagnostics(
      ({ actionId, error }) => {
        window.reportError(
          new Error(`Keyboard action failed: ${actionId}`, { cause: error }),
        );
      },
    );
    const binding = bindActionKeyboardDispatcher(registry, window);
    return () => {
      binding[Symbol.dispose]();
      unsubscribeDiagnostics();
    };
  }, [registry]);

  return null;
}

export function bindActionKeyboardDispatcher(
  registry: ActionRegistry,
  target: KeyboardEventTarget,
): Disposable {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.getModifierState("AltGraph") ||
      (isEditableEventTarget(event) && !hasEditableGlobalModifier(event))
    ) {
      return;
    }

    const shortcut = asResolvedShortcutFromKeyboardEvent(event);
    if (!shortcut || registry.getConfirmedBindingsSnapshot() === undefined) {
      return;
    }

    const claimants = registry
      .getCatalogSnapshot()
      .filter((entry) => entry.binding === shortcut);
    if (claimants.length === 0) return;

    event.preventDefault();
    if (event.repeat || claimants.length !== 1) return;

    const [claimant] = claimants;
    if (!claimant) return;
    void registry.invoke(claimant.id, "keyboard").catch(() => undefined);
  };

  target.addEventListener("keydown", onKeyDown);
  let active = true;
  return {
    [Symbol.dispose]() {
      if (!active) return;
      active = false;
      target.removeEventListener("keydown", onKeyDown);
    },
  };
}

function hasEditableGlobalModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function isEditableEventTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const element = candidate as {
      readonly isContentEditable?: boolean;
      readonly tagName?: unknown;
    };
    if (element.isContentEditable) return true;
    if (typeof element.tagName !== "string") return false;
    return ["INPUT", "SELECT", "TEXTAREA"].includes(
      element.tagName.toUpperCase(),
    );
  });
}
