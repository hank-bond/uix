// agent tool contribution registry.
//
// Features contribute pi tool definitions as data. This substrate owns
// registration lifetime and the pi-facing installer that installs those tools
// into the live agent extension.
//
// Authors give a local `name` + the tool body (everything but the pi tool
// `name`); the facet derives both ids — see agent-tool-normalization.ts. The
// registry dedups on the `ContributionId` and the derived pi tool name; the
// installer forwards the name-stamped `ToolDefinition` to pi.

import { DisposableBag } from "../lifecycle";

import {
  type AgentToolRegistration,
  normalizeAgentToolContribution,
} from "./normalization";
import type { AgentInstaller } from "../agent/installers";
import type { AgentToolContribution } from "@uix/api/agent-tools";

export class AgentToolRegistry {
  readonly registeredContributions: AgentToolRegistration[] = [];

  register(contribution: AgentToolRegistration): Disposable {
    if (
      this.registeredContributions.some(
        (e) => e.canonicalId === contribution.canonicalId,
      )
    ) {
      throw new Error(
        `Agent tool already registered: ${contribution.canonicalId}`,
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
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    bag.add(
      registry.register(
        normalizeAgentToolContribution(featureId, contribution),
      ),
    );
  }
  return bag;
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
