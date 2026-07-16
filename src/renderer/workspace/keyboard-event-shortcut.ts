import type { ResolvedShortcut } from "@uix/api/shortcuts";

const namedKeys: Readonly<Record<string, string>> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  Backspace: "backspace",
  Delete: "delete",
  End: "end",
  Enter: "enter",
  Escape: "escape",
  Home: "home",
  Insert: "insert",
  PageDown: "pagedown",
  PageUp: "pageup",
  Spacebar: "space",
  Tab: "tab",
  " ": "space",
};

export function asResolvedShortcutFromKeyboardEvent(
  event: KeyboardEvent,
): ResolvedShortcut | undefined {
  const key = asShortcutKey(event);
  if (!key) return undefined;

  const modifiers = [
    ...(event.metaKey ? ["meta"] : []),
    ...(event.ctrlKey ? ["ctrl"] : []),
    ...(event.altKey ? ["alt"] : []),
    ...(event.shiftKey ? ["shift"] : []),
  ];
  return [...modifiers, key].join("+") as ResolvedShortcut;
}

function asShortcutKey(event: KeyboardEvent): string | undefined {
  const normalizedKey = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(normalizedKey)) return normalizedKey;
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(normalizedKey)) {
    return normalizedKey;
  }

  const namedKey = namedKeys[event.key];
  if (namedKey) return namedKey;

  // Shift and Option/Alt can replace a printable `key` with the character
  // they produce; `code` retains the letter or digit key in the gesture.
  const letterCode = /^Key([A-Z])$/.exec(event.code);
  if (letterCode?.[1]) return letterCode[1].toLowerCase();
  const digitCode = /^Digit([0-9])$/.exec(event.code);
  return digitCode?.[1];
}
