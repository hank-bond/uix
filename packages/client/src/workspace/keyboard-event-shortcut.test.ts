import { describe, expect, it } from "vitest";

import { asResolvedShortcutFromKeyboardEvent } from "./keyboard-event-shortcut";

function keyboardEvent(
  overrides: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key">,
): KeyboardEvent {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("asResolvedShortcutFromKeyboardEvent", () => {
  it.each([
    {
      event: keyboardEvent({ key: "K", code: "KeyK", ctrlKey: true }),
      expected: "ctrl+k",
    },
    {
      event: keyboardEvent({
        key: "K",
        code: "KeyK",
        metaKey: true,
        shiftKey: true,
      }),
      expected: "meta+shift+k",
    },
    {
      event: keyboardEvent({ key: "!", code: "Digit1", shiftKey: true }),
      expected: "shift+1",
    },
    {
      event: keyboardEvent({ key: "ArrowLeft", altKey: true }),
      expected: "alt+left",
    },
    {
      event: keyboardEvent({ key: "å", code: "KeyA", altKey: true }),
      expected: "alt+a",
    },
    {
      event: keyboardEvent({ key: "F12", ctrlKey: true }),
      expected: "ctrl+f12",
    },
    {
      event: keyboardEvent({ key: " ", metaKey: true }),
      expected: "meta+space",
    },
    {
      event: keyboardEvent({ key: "n", code: "KeyN" }),
      expected: "n",
    },
  ])("normalizes $expected", ({ event, expected }) => {
    expect(asResolvedShortcutFromKeyboardEvent(event)).toBe(expected);
  });

  it("ignores keys outside the shortcut vocabulary", () => {
    expect(
      asResolvedShortcutFromKeyboardEvent(
        keyboardEvent({ key: ";", code: "Semicolon", ctrlKey: true }),
      ),
    ).toBeUndefined();
  });
});
