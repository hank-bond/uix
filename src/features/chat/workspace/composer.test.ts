import { describe, expect, it } from "vitest";

import {
  deriveComposerKeyboardIntent,
  deriveComposerPresentation,
} from "./composer";

describe("Chat composer", () => {
  it("presents shared activity as an enabled stop action", () => {
    expect(
      deriveComposerPresentation({
        canStop: true,
        isStopping: false,
        hasDraft: false,
      }),
    ).toEqual({ action: "cancel", disabled: false, label: "stop" });
  });

  it("disables repeated cancellation while stopping", () => {
    expect(
      deriveComposerPresentation({
        canStop: true,
        isStopping: true,
        hasDraft: false,
      }),
    ).toEqual({ action: "cancel", disabled: true, label: "stopping…" });
  });

  it("maps Escape to cancellation only for stoppable activity", () => {
    expect(
      deriveComposerKeyboardIntent({
        key: "Escape",
        shiftKey: false,
        canStop: true,
        isStopping: false,
      }),
    ).toBe("cancel");
    expect(
      deriveComposerKeyboardIntent({
        key: "Escape",
        shiftKey: false,
        canStop: false,
        isStopping: false,
      }),
    ).toBeUndefined();
    expect(
      deriveComposerKeyboardIntent({
        key: "Escape",
        shiftKey: false,
        canStop: true,
        isStopping: true,
      }),
    ).toBeUndefined();
  });

  it("prevents Enter from submitting or editing while a turn is active", () => {
    expect(
      deriveComposerKeyboardIntent({
        key: "Enter",
        shiftKey: false,
        canStop: true,
        isStopping: false,
      }),
    ).toBe("prevent");
  });
});
