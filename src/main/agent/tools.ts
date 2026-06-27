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

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type { ContributionId } from "#shared/contribution-id";
import { DisposableBag } from "../lifecycle";

import {
  type AgentToolDefinition,
  type AgentToolRegistration,
  normalizeAgentToolContribution,
} from "./agent-tool-normalization";
import type { AgentInstaller } from "./installers";

export interface AgentToolContribution {
  /** Local tool name: the facet derives `${featureId}__${name}` as the pi tool name. */
  readonly name: string;
  /** Tool definition: everything but `name` from the pi Type, since the facet derives the name. */
  readonly tool: AgentToolDefinition;
}

export interface AgentToolRegistry {
  register(contribution: AgentToolRegistration): Disposable;
}

class RegisteredAgentToolContributions implements AgentToolRegistry {
  readonly registeredContributions: AgentToolRegistration[] = [];

  register(contribution: AgentToolRegistration): Disposable {
    if (
      this.registeredContributions.some(
        (e) => e.contributionId === contribution.contributionId,
      )
    ) {
      throw new Error(
        `Agent tool contribution already registered: ${contribution.contributionId as string}`,
      );
    }
    if (
      this.registeredContributions.some(
        (e) => e.canonicalId === contribution.canonicalId,
      )
    ) {
      throw new Error(
        `Agent tool already registered: ${contribution.canonicalId as string}`,
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

export function createAgentToolRegistry(): AgentToolRegistry {
  return new RegisteredAgentToolContributions();
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
  if (!(registry instanceof RegisteredAgentToolContributions)) {
    throw new Error(
      "createAgentToolInstaller requires createAgentToolRegistry()",
    );
  }

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
  registry: RegisteredAgentToolContributions,
  installedContributions: readonly AgentToolRegistration[],
): readonly AgentToolRegistration[] {
  return installedContributions.filter((contribution) =>
    registry.registeredContributions.includes(contribution),
  );
}
