// Assembles each feature's system-prompt section in workspace order for Pi.
//
// One Markdown blob per feature is retained in manifest order. The
// system-prompt assembler captures the current composition snapshot when Pi's
// extension runtime starts or reloads; registering a contribution never
// touches Pi.

import type { AgentSystemPromptContribution } from "@uix/api/agent-system-prompt";
import {
  type ContributionId,
  toContributionId,
} from "@uix/api/contribution-id";

import { disposable } from "./lifecycle";

export interface ResolvedAgentSystemPromptContribution {
  readonly featureId: string;
  readonly contributionId: ContributionId;
  readonly content: string;
}

export class AgentSystemPromptRegistry {
  #registeredSections: ResolvedAgentSystemPromptContribution[] = [];

  register(
    resolvedContribution: ResolvedAgentSystemPromptContribution,
  ): Disposable {
    if (
      this.#registeredSections.some(
        (section) =>
          section.contributionId === resolvedContribution.contributionId,
      )
    ) {
      throw new Error(
        `Agent system prompt already registered: ${resolvedContribution.featureId}`,
      );
    }

    this.#registeredSections.push(resolvedContribution);
    return disposable(() => {
      const index = this.#registeredSections.indexOf(resolvedContribution);
      if (index !== -1) this.#registeredSections.splice(index, 1);
    });
  }

  /** Current resolved sections in manifest order. */
  list(): readonly ResolvedAgentSystemPromptContribution[] {
    return [...this.#registeredSections];
  }
}

export function resolveAgentSystemPromptContribution(
  featureId: string,
  contribution: AgentSystemPromptContribution,
): ResolvedAgentSystemPromptContribution {
  if (typeof contribution !== "string" || contribution.trim() === "") {
    throw new Error(
      `Feature ${featureId} has an invalid agent system prompt: expected non-empty Markdown`,
    );
  }
  return {
    featureId,
    contributionId: toContributionId(featureId, "agent-system-prompt"),
    content: contribution.trim(),
  };
}

export function registerAgentSystemPromptContribution(
  registry: AgentSystemPromptRegistry,
  featureId: string,
  contribution: AgentSystemPromptContribution,
): Disposable {
  return registry.register(
    resolveAgentSystemPromptContribution(featureId, contribution),
  );
}

export function assembleAgentSystemPromptSection(
  registry: AgentSystemPromptRegistry,
): string | undefined {
  const sections = registry.list();
  return sections.length
    ? sections.map((section) => section.content).join("\n\n")
    : undefined;
}
