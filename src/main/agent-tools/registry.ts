// agent tool contribution registry.
//
// Features contribute pi tool definitions as data. This substrate owns
// their live registry lifetime and the pi-facing installer that installs them
// into the live agent extension.
//
// Ordinary tools derive a feature-namespaced Pi name; explicit exact-name tools
// keep their authored Pi name. The registry deduplicates contribution ids and
// final names, then installs one snapshot into Pi.

import { DisposableBag } from "../lifecycle";

import {
  type ResolvedAgentToolContribution,
  resolveAgentToolContribution,
  resolveAgentToolOverrideContribution,
} from "./resolution";
import type { AgentInstaller } from "../agent/installers";
import type {
  AgentToolContribution,
  AgentToolOverrideContribution,
} from "@uix/api/agent-tools";

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

export function registerAgentToolContributions(
  registry: AgentToolRegistry,
  featureId: string,
  contributions: readonly AgentToolContribution[],
): Disposable {
  return registerContributions(
    registry,
    featureId,
    contributions,
    resolveAgentToolContribution,
  );
}

export function registerAgentToolOverrideContributions(
  registry: AgentToolRegistry,
  featureId: string,
  contributions: readonly AgentToolOverrideContribution[],
): Disposable {
  return registerContributions(
    registry,
    featureId,
    contributions,
    resolveAgentToolOverrideContribution,
  );
}

function registerContributions<Contribution>(
  registry: AgentToolRegistry,
  featureId: string,
  contributions: readonly Contribution[],
  resolve: (
    featureId: string,
    contribution: Contribution,
  ) => ResolvedAgentToolContribution,
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
      bag.add(registry.register(resolve(featureId, contribution)));
    }
    return bag;
  } catch (err) {
    bag[Symbol.dispose]();
    throw err;
  }
}

export function createAgentToolInstaller(
  registry: AgentToolRegistry,
): AgentInstaller {
  return (pi) => {
    for (const registeredTool of registry.list()) {
      pi.registerTool(registeredTool.tool);
    }
  };
}
