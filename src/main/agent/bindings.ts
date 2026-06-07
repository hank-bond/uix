// UIX cockpit — agent-surface composition root.
//
// UIX-core's agent contributions ride a single in-process pi extension. Each
// subsection contributes an AgentBinding: a function handed the live pi handle
// that registers its own tools, hooks, and transforms. This is substrate
// wiring onto pi's surface, not a packaged extension — bindings are
// substrate-owned and may use cockpit internals directly.

import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

// A subsection handed the live pi ExtensionAPI to bind itself onto pi's
// surface. We keep the subsection as the unit (rather than free-floating
// install calls) so there is one inventory of what UIX-core contributes; we
// hand it pi directly (rather than a declarative bag of tools + context)
// because hooks and appendEntry / sendMessage are imperative calls at a
// boundary, not static data.
export type AgentBinding = (pi: ExtensionAPI) => void | Promise<void>;

// Compose the bindings into one pi ExtensionFactory. This is the single place
// agent-surface registration order is decided: pi dispatches every hook by
// registration order with no priority field, so the order bindings run here is
// the composition semantics (chained "input" transforms, system-prompt edits,
// tool_call mutations). Order is legible because it is exactly the list order.
export function createUixCoreExtension(
  bindings: readonly AgentBinding[],
): ExtensionFactory {
  return async (pi) => {
    for (const binding of bindings) await binding(pi);
  };
}
