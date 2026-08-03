// Collects feature-provided Pi skill paths and supplies them when Pi discovers runtime resources.
//
// Features declare files/directories relative to their entry file. The registry
// stores resolved contributions in manifest and declaration order; one
// substrate installer forwards the active path snapshot through Pi's
// resources_discover event.

import { isAbsolute, resolve } from "node:path";

import type { AgentSkillContribution } from "@uix/api/agent-skills";

import type { AgentInstaller } from "./agent/installers";
import { disposable } from "./lifecycle";

export interface ResolvedAgentSkillContribution {
  readonly featureId: string;
  readonly path: string;
}

export class AgentSkillRegistry {
  #registeredSkills: ResolvedAgentSkillContribution[] = [];

  register(
    resolvedContributions: readonly ResolvedAgentSkillContribution[],
  ): Disposable {
    const added = [...resolvedContributions];
    this.#registeredSkills.push(...added);
    return disposable(() => {
      this.#registeredSkills = this.#registeredSkills.filter(
        (skill) => !added.includes(skill),
      );
    });
  }

  /** Current resolved skills in manifest and declaration order. */
  list(): readonly ResolvedAgentSkillContribution[] {
    return [...this.#registeredSkills];
  }
}

export function resolveAgentSkillContributions(
  featureId: string,
  contributions: readonly AgentSkillContribution[],
  entryDir: string,
): readonly ResolvedAgentSkillContribution[] {
  return contributions.map((ref) => {
    if (typeof ref !== "string" || ref.trim() === "") {
      throw new Error(
        `Feature ${featureId} has an invalid agent skill ref: ${ref}`,
      );
    }
    return {
      featureId,
      path: isAbsolute(ref) ? ref : resolve(entryDir, ref),
    };
  });
}

export function registerAgentSkillContributions(
  registry: AgentSkillRegistry,
  featureId: string,
  contributions: readonly AgentSkillContribution[],
  entryDir: string,
): Disposable {
  return registry.register(
    resolveAgentSkillContributions(featureId, contributions, entryDir),
  );
}

/** Capture one active-path snapshot for this Pi extension runtime. */
export function createAgentSkillInstaller(
  registry: AgentSkillRegistry,
): AgentInstaller {
  return (pi) => {
    const skillPaths = registry.list().map((skill) => skill.path);
    if (skillPaths.length === 0) return;
    pi.on("resources_discover", () => ({ skillPaths }));
  };
}
