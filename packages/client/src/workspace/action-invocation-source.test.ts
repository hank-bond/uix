import { describe, expect, it, vi } from "vitest";

import type { ActionId } from "@uix/api/actions";

import {
  type ActionInvocationSource,
  bindActionInvocationSource,
} from "./action-invocation-source";
import { ActionRegistry } from "./action-registry";

class FakeActionInvocationSource implements ActionInvocationSource {
  handler: ((actionId: ActionId) => void) | undefined;

  subscribe(handler: (actionId: ActionId) => void): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = undefined;
    };
  }

  invoke(actionId: ActionId): void {
    this.handler?.(actionId);
  }
}

describe("action invocation source", () => {
  it("routes host-owned action ids through the renderer registry", () => {
    const run = vi.fn();
    using registry = new ActionRegistry({ shortcutPlatform: "other" });
    registry.forFeature("uix")({
      reload: { title: "Reload Workspace", run },
    });
    const source = new FakeActionInvocationSource();
    using _binding = bindActionInvocationSource(registry, source, vi.fn());

    source.invoke("uix.reload");

    expect(run).toHaveBeenCalledOnce();
  });

  it("disposes the host subscription and reports callback failures", async () => {
    const failure = new Error("reload failed");
    using registry = new ActionRegistry({ shortcutPlatform: "other" });
    registry.forFeature("uix")({
      reload: {
        title: "Reload Workspace",
        run: () => Promise.reject(failure),
      },
    });
    const source = new FakeActionInvocationSource();
    const onError = vi.fn();
    const binding = bindActionInvocationSource(registry, source, onError);

    source.invoke("uix.reload");
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith("uix.reload", failure);
    });

    binding[Symbol.dispose]();
    expect(source.handler).toBeUndefined();
  });
});
