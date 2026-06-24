// agent-surface composition root.
//
// UIX-core's agent installers ride a single in-process pi extension. Each
// installer is handed the live pi handle and registers its own tools, hooks, or
// session behavior. This is substrate wiring onto pi's surface, not a packaged
// extension — installers are substrate-owned and may use cockpit internals
// directly.

import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

// A subsection handed the live pi ExtensionAPI to install its agent-facing
// behavior. We keep the subsection as the unit (rather than free-floating
// install calls) so there is one inventory of UIX-core's agent surface; we hand
// it pi directly (rather than a declarative bag of tools + context) because
// hooks and appendEntry / sendMessage are imperative calls at a boundary, not
// static data.
export type AgentInstaller = (pi: ExtensionAPI) => void | Promise<void>;

// Compose the installers into one pi ExtensionFactory. This is the single place
// agent-surface registration order is decided: pi dispatches every hook by
// registration order with no priority field, so the order installers run here
// is the composition semantics (chained "input" transforms, system-prompt
// edits, tool_call mutations). Order is legible because it is exactly the list
// order.
export function createUixCoreExtension(
  installers: readonly AgentInstaller[],
): ExtensionFactory {
  return async (pi) => {
    for (const installer of installers) await installer(pi);
  };
}
