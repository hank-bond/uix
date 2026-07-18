// Feature-supplied Pi skills.
//
// Features declare files/directories relative to their entry file. The registry
// holds resolved paths in manifest order; one substrate installer forwards the
// runtime snapshot through Pi's resources_discover event.

import { isAbsolute, resolve } from "node:path";

import type { AgentSkillContribution } from "@uix/api/agent-skills";
import type { AgentInstaller } from "../agent/installers";
import { disposable } from "../lifecycle";

interface AgentSkillRegistration {
  readonly featureId: string;
  readonly path: string;
}

export class AgentSkillRegistry {
  #entries: AgentSkillRegistration[] = [];

  register(entries: readonly AgentSkillRegistration[]): Disposable {
    const added = [...entries];
    this.#entries.push(...added);
    return disposable(() => {
      this.#entries = this.#entries.filter((entry) => !added.includes(entry));
    });
  }

  /** Current resolved skill paths in manifest registration order. */
  list(): readonly string[] {
    return this.#entries.map((entry) => entry.path);
  }
}

export function registerAgentSkillContributions(
  registry: AgentSkillRegistry,
  featureId: string,
  contributions: readonly AgentSkillContribution[],
  entryDir: string,
): Disposable {
  return registry.register(
    contributions.map((ref) => {
      if (typeof ref !== "string" || ref.trim() === "") {
        throw new Error(
          `Feature ${featureId} has an invalid agent skill ref: ${String(ref)}`,
        );
      }
      return {
        featureId,
        path: isAbsolute(ref) ? ref : resolve(entryDir, ref),
      };
    }),
  );
}

/** Capture one active-path snapshot for this Pi extension runtime. */
export function createAgentSkillInstaller(
  registry: AgentSkillRegistry,
): AgentInstaller {
  return (pi) => {
    const skillPaths = [...registry.list()];
    if (skillPaths.length === 0) return;
    pi.on("resources_discover", () => ({ skillPaths }));
  };
}
