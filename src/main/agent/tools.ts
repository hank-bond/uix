// UIX cockpit — agent tool contribution registry.
//
// Features contribute pi tool definitions as data. This substrate owns
// registration lifetime and the pi-facing installer that installs those tools
// into the live agent extension.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import { DisposableBag } from "../lifecycle";

import type { AgentInstaller } from "./installers";

export interface AgentToolContribution {
  id: string;
  tool: ToolDefinition;
}

export interface AgentToolRegistry {
  register(contribution: AgentToolContribution): Disposable;
}

class RegisteredAgentToolContributions implements AgentToolRegistry {
  readonly registeredContributions: AgentToolContribution[] = [];

  register(contribution: AgentToolContribution): Disposable {
    if (this.registeredContributions.some((e) => e.id === contribution.id)) {
      throw new Error(
        `Agent tool contribution already registered: ${contribution.id}`,
      );
    }
    if (
      this.registeredContributions.some(
        (e) => e.tool.name === contribution.tool.name,
      )
    ) {
      throw new Error(
        `Agent tool already registered: ${contribution.tool.name}`,
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
  contributions: readonly AgentToolContribution[],
): Disposable {
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    bag.add(registry.register(contribution));
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
  installedContributions: readonly AgentToolContribution[],
): readonly AgentToolContribution[] {
  return installedContributions.filter((contribution) =>
    registry.registeredContributions.includes(contribution),
  );
}
