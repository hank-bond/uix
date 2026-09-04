import { describe, expect, it } from "vitest";

import type { AgentInstance } from "./agent/instance";
import type { AgentInstanceGuard } from "./agent/instance-supervisor";
import { AttachmentWebBindingRegistry } from "./attachment-web-bindings";
import { createGuard } from "./guard";
import { toSessionId } from "./workspace";

function createTargetGuard(sessionId: string): AgentInstanceGuard {
  const value = {
    target: { sessionId: toSessionId(sessionId) },
  } as AgentInstance;
  const retain = (origin: string): AgentInstanceGuard =>
    createGuard({
      label: `Agent instance ${origin}`,
      value,
      retain,
      onDispose: () => undefined,
    });
  return retain("fixture");
}

describe("attachment web bindings", () => {
  it("gives peer attachments independent bindings to one target", () => {
    using registry = new AttachmentWebBindingRegistry();
    using target = createTargetGuard("session-1");
    using first = registry.register(target);
    using second = registry.register(target);

    expect(first.binding).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(first.binding).not.toBe(second.binding);
    using firstRequest = registry.retainTarget(first.binding);
    using secondRequest = registry.retainTarget(second.binding);
    expect(firstRequest?.value.target).toEqual(target.value.target);
    expect(secondRequest?.value.target).toEqual(target.value.target);

    first[Symbol.dispose]();
    expect(registry.retainTarget(first.binding)).toBeUndefined();
    using retainedPeer = registry.retainTarget(second.binding);
    expect(retainedPeer?.value.target).toEqual(target.value.target);
  });

  it("rejects a revoked generation while an accepted target guard stays usable", () => {
    using registry = new AttachmentWebBindingRegistry();
    using previousTarget = createTargetGuard("session-1");
    using nextTarget = createTargetGuard("session-2");
    using previous = registry.register(previousTarget);

    using accepted = registry.retainTarget(previous.binding);
    using replacement = registry.register(nextTarget);
    previous[Symbol.dispose]();

    expect(registry.retainTarget(previous.binding)).toBeUndefined();
    expect(accepted?.value.target.sessionId).toBe(toSessionId("session-1"));
    using nextRequest = registry.retainTarget(replacement.binding);
    expect(nextRequest?.value.target.sessionId).toBe(toSessionId("session-2"));
  });

  it("revokes every binding when the registry closes", () => {
    const registry = new AttachmentWebBindingRegistry();
    using target = createTargetGuard("session-1");
    using bindingHandle = registry.register(target);

    registry[Symbol.dispose]();

    expect(registry.retainTarget(bindingHandle.binding)).toBeUndefined();
    expect(() => registry.register(target)).toThrow("registry is disposed");
  });
});
