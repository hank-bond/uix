import type { KeybindingMap } from "@uix/api/actions";
import { normalizeShortcut } from "@uix/api/shortcuts";

interface CreateKeybindingRequestHandlersOptions {
  getBindingsSnapshot(): KeybindingMap;
  replaceBindings(candidate: KeybindingMap): KeybindingMap;
  publishBindingsChanged(bindings: KeybindingMap): void;
}

interface KeybindingRequestHandlers {
  reconcileDefaults(defaults: KeybindingMap): KeybindingMap;
  replaceBindings(candidate: KeybindingMap): KeybindingMap;
}

export function createKeybindingRequestHandlers(
  options: CreateKeybindingRequestHandlersOptions,
): KeybindingRequestHandlers {
  return {
    reconcileDefaults(defaults) {
      const persisted = options.getBindingsSnapshot();
      const current = normalizeKeybindingMap(persisted);
      const candidate = {
        ...normalizeKeybindingMap(defaults),
        ...current,
      };
      return replaceAndPublishBindingsIfChanged(options, persisted, candidate);
    },

    replaceBindings(candidate) {
      const persisted = options.getBindingsSnapshot();
      return replaceAndPublishBindingsIfChanged(
        options,
        persisted,
        normalizeKeybindingMap(candidate),
      );
    },
  };
}

function normalizeKeybindingMap(bindings: KeybindingMap): KeybindingMap {
  return Object.fromEntries(
    Object.entries(bindings).map(([actionId, shortcut]) => [
      actionId,
      shortcut === null ? null : normalizeShortcut(shortcut),
    ]),
  );
}

function replaceAndPublishBindingsIfChanged(
  options: CreateKeybindingRequestHandlersOptions,
  current: KeybindingMap,
  candidate: KeybindingMap,
): KeybindingMap {
  if (hasSameKeybindingMap(current, candidate)) return candidate;
  const confirmed = options.replaceBindings(candidate);
  options.publishBindingsChanged(confirmed);
  return confirmed;
}

function hasSameKeybindingMap(
  left: KeybindingMap,
  right: KeybindingMap,
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(
    ([actionId, shortcut]) =>
      Object.hasOwn(right, actionId) && right[actionId] === shortcut,
  );
}
