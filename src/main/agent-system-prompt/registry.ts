// Stable feature-owned system-prompt sections.
//
// One Markdown blob per feature is retained in manifest registration order.
// The system-prompt assembler snapshots the current composition when Pi's
// extension runtime starts/reloads; registration itself never touches Pi.

import {
  toContributionId,
  type ContributionId,
} from "@uix/api/contribution-id";
import type { AgentSystemPromptContribution } from "@uix/api/agent-system-prompt";

import { disposable } from "../lifecycle";

interface AgentSystemPromptRegistration {
  readonly featureId: string;
  readonly contributionId: ContributionId;
  readonly content: string;
}

export class AgentSystemPromptRegistry {
  #entries: AgentSystemPromptRegistration[] = [];

  register(
    featureId: string,
    contribution: AgentSystemPromptContribution,
  ): Disposable {
    const contributionId = toContributionId(featureId, "agent-system-prompt");
    if (
      this.#entries.some((entry) => entry.contributionId === contributionId)
    ) {
      throw new Error(`Agent system prompt already registered: ${featureId}`);
    }
    if (typeof contribution !== "string" || contribution.trim() === "") {
      throw new Error(
        `Feature ${featureId} has an invalid agent system prompt: expected non-empty Markdown`,
      );
    }

    const entry = {
      featureId,
      contributionId,
      content: contribution.trim(),
    };
    this.#entries.push(entry);
    return disposable(() => {
      const index = this.#entries.indexOf(entry);
      if (index !== -1) this.#entries.splice(index, 1);
    });
  }

  /** Current system-prompt blobs in manifest registration order. */
  list(): readonly string[] {
    return this.#entries.map((entry) => entry.content);
  }
}

export function registerAgentSystemPromptContribution(
  registry: AgentSystemPromptRegistry,
  featureId: string,
  contribution: AgentSystemPromptContribution,
): Disposable {
  return registry.register(featureId, contribution);
}

export function buildAgentSystemPromptSection(
  registry: AgentSystemPromptRegistry,
): string | undefined {
  const sections = registry.list();
  return sections.length ? sections.join("\n\n") : undefined;
}
