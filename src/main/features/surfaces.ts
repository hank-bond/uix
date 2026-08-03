// Resolves feature surface entry paths and keeps active surfaces in workspace and declaration order.
//
// Registration preserves manifest order followed by each feature's declaration
// order. Returned lifetimes remove the exact contributed entries without
// disturbing replacement instances.

import { isAbsolute, resolve } from "node:path";

import { disposable } from "../lifecycle";

/** One mountable surface with its owner and entry-file paths resolved. */
export interface ResolvedSurfaceContribution {
  readonly featureId: string;
  /** Absolute path to the surface module's entry file. */
  readonly entry: string;
  /**
   * The feature's root directory (its entry file's dir). Surface refs
   * resolved against it; the pipeline serves CSS/assets from inside it and
   * refuses imports that escape it.
   */
  readonly featureRoot: string;
}

/** Owns the ordered surface contributions from active feature instances. */
export class SurfaceRegistry {
  #registeredSurfaces: ResolvedSurfaceContribution[] = [];

  /** Add resolved surfaces and return a lifetime that removes those exact entries. */
  register(
    resolvedContributions: readonly ResolvedSurfaceContribution[],
  ): Disposable {
    const added = [...resolvedContributions];
    this.#registeredSurfaces.push(...added);

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      this.#registeredSurfaces = this.#registeredSurfaces.filter(
        (surface) => !added.includes(surface),
      );
    });
  }

  /** Current composition in manifest and declaration order. */
  list(): readonly ResolvedSurfaceContribution[] {
    return [...this.#registeredSurfaces];
  }
}

/** Resolves a feature's surface entry refs against its entry-file directory. */
export function resolveSurfaceContributions(
  featureId: string,
  surfaceRefs: readonly string[],
  entryDir: string,
): readonly ResolvedSurfaceContribution[] {
  return surfaceRefs.map((ref) => {
    if (typeof ref !== "string" || ref.length === 0) {
      throw new Error(
        `Feature ${featureId} has an invalid surface entry ref: ${ref}`,
      );
    }
    return {
      featureId,
      entry: isAbsolute(ref) ? ref : resolve(entryDir, ref),
      featureRoot: entryDir,
    };
  });
}

/** Resolves and registers one feature's surface entry refs. */
export function registerSurfaceContributions(
  registry: SurfaceRegistry,
  featureId: string,
  surfaceRefs: readonly string[],
  entryDir: string,
): Disposable {
  return registry.register(
    resolveSurfaceContributions(featureId, surfaceRefs, entryDir),
  );
}
