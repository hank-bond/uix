import type {
  ActionCatalog,
  ActionCatalogEntry,
  KeybindingMap,
} from "@uix/api/actions";
import {
  resolveShortcutForPlatform,
  type ShortcutPlatform,
} from "@uix/api/shortcuts";

interface ActionBindingProjection {
  readonly catalog: ActionCatalog;
  readonly unresolvedBindings: Readonly<KeybindingMap>;
}

export function deriveActionBindingProjectionForPlatform(
  catalog: ActionCatalog,
  bindings: Readonly<KeybindingMap>,
  platform: ShortcutPlatform,
): ActionBindingProjection {
  const activeIds = new Set(catalog.map(({ id }) => id));
  const claimantsPerShortcut = new Map<string, string[]>();

  for (const entry of catalog) {
    const binding = bindings[entry.id];
    if (typeof binding !== "string") continue;
    const resolved = resolveShortcutForPlatform(binding, platform);
    const claimants = claimantsPerShortcut.get(resolved) ?? [];
    claimants.push(entry.id);
    claimantsPerShortcut.set(resolved, claimants);
  }

  const projectedCatalog = catalog.map((entry): ActionCatalogEntry => {
    const binding = bindings[entry.id];
    const resolvedBinding =
      typeof binding === "string"
        ? resolveShortcutForPlatform(binding, platform)
        : binding;
    const conflictsWith =
      typeof resolvedBinding === "string"
        ? (claimantsPerShortcut.get(resolvedBinding) ?? []).filter(
            (id) => id !== entry.id,
          )
        : [];
    return {
      ...entry,
      ...(Object.hasOwn(bindings, entry.id)
        ? { binding: resolvedBinding }
        : {}),
      conflictsWith,
    };
  });

  const unresolvedBindings = Object.fromEntries(
    Object.entries(bindings).filter(([actionId]) => !activeIds.has(actionId)),
  ) as KeybindingMap;

  return {
    catalog: projectedCatalog,
    unresolvedBindings,
  };
}
