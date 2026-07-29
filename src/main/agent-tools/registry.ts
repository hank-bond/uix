// agent tool contribution registry.
//
// Features contribute pi tool definitions as data. This substrate owns
// registration lifetime and the pi-facing installer that installs those tools
// into the live agent extension.
//
// Ordinary tools derive a feature-namespaced Pi name; explicit overrides keep
// an exact Pi name. The registry deduplicates both feature contribution ids and
// final Pi names, then the installer forwards each stamped definition to Pi.

import { DisposableBag } from "../lifecycle";

import {
  type AgentToolRegistration,
  normalizeAgentToolContribution,
  normalizeAgentToolOverrideContribution,
} from "./normalization";
import type { AgentInstaller } from "../agent/installers";
import type {
  AgentToolContribution,
  AgentToolOverrideContribution,
} from "@uix/api/agent-tools";

export class AgentToolRegistry {
  readonly registeredContributions: AgentToolRegistration[] = [];

  register(contribution: AgentToolRegistration): Disposable {
    if (
      this.registeredContributions.some(
        (entry) => entry.contributionId === contribution.contributionId,
      )
    ) {
      throw new Error(
        `Agent tool contribution already registered: ${contribution.contributionId}`,
      );
    }
    const existingCanonical = this.registeredContributions.find(
      (entry) => entry.canonicalId === contribution.canonicalId,
    );
    if (existingCanonical) {
      throw new Error(
        `Agent tool name already registered: ${contribution.canonicalId} (existing: ${existingCanonical.contributionId}, attempted: ${contribution.contributionId})`,
      );
    }

    this.registeredContributions.push(contribution);

    return {
      [Symbol.dispose]: (): void => {
        const index = this.registeredContributions.indexOf(contribution);
        if (index !== -1) this.registeredContributions.splice(index, 1);
      },
    };
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
    normalizeAgentToolContribution,
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
    normalizeAgentToolOverrideContribution,
  );
}

function registerContributions<Contribution>(
  registry: AgentToolRegistry,
  featureId: string,
  contributions: readonly Contribution[],
  normalize: (
    featureId: string,
    contribution: Contribution,
  ) => AgentToolRegistration,
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
      bag.add(registry.register(normalize(featureId, contribution)));
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
    const installedContributions = [...registry.registeredContributions];
    for (const contribution of liveContributions(
      registry,
      installedContributions,
    )) {
      pi.registerTool(contribution.tool);
    }
  };
}

function liveContributions(
  registry: AgentToolRegistry,
  installedContributions: readonly AgentToolRegistration[],
): readonly AgentToolRegistration[] {
  return installedContributions.filter((contribution) =>
    registry.registeredContributions.includes(contribution),
  );
}
