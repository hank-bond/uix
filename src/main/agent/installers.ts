// Assembles UIX's ordered Pi setup hooks into the single in-process extension used by each runtime.
//
// UIX-core's agent installers ride a single in-process Pi extension. The runtime
// hands each installer the live Pi handle, and it registers its own tools, hooks, or
// session behavior. This is substrate wiring onto Pi's surface, not a packaged
// extension. Installers are substrate-owned and may use host internals
// directly.

import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

// A subsection handed the live Pi ExtensionAPI to install its agent-facing
// behavior. We keep the subsection as the unit (rather than free-floating
// install calls) so there is one inventory of UIX-core's agent surface. We hand
// it Pi directly (rather than a declarative bag of tools + context) because
// hooks and appendEntry / sendMessage are imperative calls at a boundary, not
// static data.
export type AgentInstaller = (pi: ExtensionAPI) => void | Promise<void>;

// Compose the installers into one Pi ExtensionFactory. This single place
// decides the agent-surface hook order: Pi dispatches every hook in the order
// the installer registered it, with no priority field, so the order installers run here
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
