// Retains accepted feature tools, rejects duplicate Pi names, and installs a snapshot into each Pi runtime.

import type { AgentToolContribution } from "@uix/api/agent-tools";

import {
  resolveAgentToolContribution,
  type ResolvedAgentToolContribution,
} from "./resolution";
import type { AgentInstaller } from "../agent/installers";
import { DisposableBag } from "../lifecycle";

export class AgentToolRegistry {
  readonly #registeredTools: ResolvedAgentToolContribution[] = [];

  register(resolvedContribution: ResolvedAgentToolContribution): Disposable {
    if (
      this.#registeredTools.some(
        (tool) => tool.contributionId === resolvedContribution.contributionId,
      )
    ) {
      throw new Error(
        `Agent tool contribution already registered: ${resolvedContribution.contributionId}`,
      );
    }
    const existingCanonical = this.#registeredTools.find(
      (tool) => tool.canonicalId === resolvedContribution.canonicalId,
    );
    if (existingCanonical) {
      throw new Error(
        `Agent tool name already registered: ${resolvedContribution.canonicalId} (existing: ${existingCanonical.contributionId}, attempted: ${resolvedContribution.contributionId})`,
      );
    }

    this.#registeredTools.push(resolvedContribution);

    return {
      [Symbol.dispose]: (): void => {
        const index = this.#registeredTools.indexOf(resolvedContribution);
        if (index !== -1) this.#registeredTools.splice(index, 1);
      },
    };
  }

  list(): readonly ResolvedAgentToolContribution[] {
    return [...this.#registeredTools];
  }
}

/** Register one feature's tools, retaining local names only for the designated base-tools provider. */
export function registerAgentToolContributions(
  registry: AgentToolRegistry,
  featureId: string,
  contributions: readonly AgentToolContribution[],
  options: { readonly isBaseToolsProvider?: boolean } = {},
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
      bag.add(
        registry.register(
          resolveAgentToolContribution(featureId, contribution, options),
        ),
      );
    }
    return bag;
  } catch (error) {
    bag[Symbol.dispose]();
    throw error;
  }
}

/** Installs a snapshot of every registered tool into one Pi runtime generation. */
export function createAgentToolInstaller(
  registry: AgentToolRegistry,
): AgentInstaller {
  return (pi) => {
    for (const registeredTool of registry.list()) {
      pi.registerTool(registeredTool.tool);
    }
  };
}
