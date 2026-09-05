import { expect, it, vi } from "vitest";

import { toWorkspaceId } from "@uix/runtime";
import type { AttachmentWebBinding } from "@uix/runtime/workspace";

import { AttachmentWebBindingState } from "./attachment-web-binding-state";

it("emits immutable binding revisions and releases its attachment subscription", () => {
  let change: (binding: AttachmentWebBinding) => void = () => {
    throw new Error("Not subscribed");
  };
  const release = vi.fn();
  const snapshotListener = vi.fn();
  using state = new AttachmentWebBindingState(
    {
      workspaceId: toWorkspaceId("local"),
      webBinding: "first" as AttachmentWebBinding,
      onWebBindingChange(listener) {
        change = listener;
        return { [Symbol.dispose]: release };
      },
    },
    snapshotListener,
  );
  const initial = state.snapshot;
  expect(initial).toEqual({
    workspaceId: "local",
    revision: 0,
    binding: "first",
  });
  change("second" as AttachmentWebBinding);
  expect(state.snapshot).toEqual({
    workspaceId: "local",
    revision: 1,
    binding: "second",
  });
  expect(snapshotListener).toHaveBeenLastCalledWith(state.snapshot);
  expect(Object.isFrozen(state.snapshot)).toBe(true);
  expect(initial.binding).toBe("first");
  state[Symbol.dispose]();
  expect(release).toHaveBeenCalledOnce();
});
