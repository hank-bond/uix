import { Type, type Static } from "typebox";

const shortcutModifiers = ["mod", "ctrl", "alt", "shift"] as const;
const resolvedShortcutModifiers = ["meta", "ctrl", "alt", "shift"] as const;
const namedShortcutKeys = [
  "backspace",
  "delete",
  "down",
  "end",
  "enter",
  "escape",
  "home",
  "insert",
  "left",
  "pagedown",
  "pageup",
  "right",
  "space",
  "tab",
  "up",
] as const;

export type ShortcutModifier = (typeof shortcutModifiers)[number];
export type ShortcutPlatform = "macos" | "other";

/**
 * One keyboard gesture. `key` is the named key being pressed, not the
 * character produced by its modifiers (`shift+1`, never `!`).
 */
export interface ShortcutChord {
  readonly modifiers: readonly ShortcutModifier[];
  readonly key: string;
}

const modifierSequencePattern = enumerateUniqueModifierSequences(
  shortcutModifiers,
)
  .map((sequence) => `${sequence.join("\\+")}\\+`)
  .join("|");
const namedKeyPattern = namedShortcutKeys.join("|");
const shortcutKeyPattern = `(?:[a-z]|[0-9]|${namedKeyPattern}|f(?:[1-9]|1[0-9]|2[0-4]))`;
const shortcutPattern = `^(?:${modifierSequencePattern})${shortcutKeyPattern}$`;
const shortcutRegex = new RegExp(shortcutPattern);

export const ShortcutSchema = Type.String({ pattern: shortcutPattern });
export type Shortcut = Static<typeof ShortcutSchema>;

export function parseShortcut(shortcut: string): ShortcutChord {
  if (!shortcutRegex.test(shortcut)) {
    throw new Error(
      `Invalid shortcut: ${JSON.stringify(shortcut)}. Expected one modified key chord.`,
    );
  }

  const segments = shortcut.split("+");
  const key = segments.pop();
  if (key === undefined) {
    throw new Error(`Invalid shortcut: ${JSON.stringify(shortcut)}.`);
  }
  const declaredModifiers = new Set(segments as ShortcutModifier[]);
  return {
    modifiers: shortcutModifiers.filter((modifier) =>
      declaredModifiers.has(modifier),
    ),
    key,
  };
}

export function normalizeShortcut(shortcut: string): Shortcut {
  return toShortcut(parseShortcut(shortcut));
}

export function resolveShortcutForPlatform(
  shortcut: string,
  platform: ShortcutPlatform,
): string {
  const chord = parseShortcut(shortcut);
  const resolved = new Set(
    chord.modifiers.map((modifier) =>
      modifier === "mod" ? (platform === "macos" ? "meta" : "ctrl") : modifier,
    ),
  );
  const modifiers = resolvedShortcutModifiers.filter((modifier) =>
    resolved.has(modifier),
  );
  return [...modifiers, chord.key].join("+");
}

function toShortcut(chord: ShortcutChord): Shortcut {
  return [...chord.modifiers, chord.key].join("+");
}

function enumerateUniqueModifierSequences(
  values: readonly ShortcutModifier[],
): ShortcutModifier[][] {
  const result: ShortcutModifier[][] = [];
  const visit = (
    prefix: readonly ShortcutModifier[],
    remaining: readonly ShortcutModifier[],
  ): void => {
    if (prefix.length > 0) result.push([...prefix]);
    for (const [index, value] of remaining.entries()) {
      visit(
        [...prefix, value],
        remaining.filter((_, candidateIndex) => candidateIndex !== index),
      );
    }
  };
  visit([], values);
  return result;
}
