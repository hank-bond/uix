// surface contributions.
//
// The backend half of runtime surface composition: features declare surface
// entry-file refs in their contributions, the loader resolves them against
// the feature entry's directory, and this registry holds the composition the
// workspace page mounts (served as modules by the surface pipeline). Order is
// registration order — manifest order, then declaration order within a
// feature — the same explicit-ordered-composition discipline as every other
// facet.

import { isAbsolute, resolve } from "node:path";

import { disposable } from "../lifecycle";

/** One mountable surface: the owning feature and its resolved entry file. */
export interface SurfaceRegistration {
  readonly featureId: string;
  /** Absolute path to the surface module's entry file. */
  readonly entry: string;
}

export class SurfaceRegistry {
  #entries: SurfaceRegistration[] = [];

  register(entries: readonly SurfaceRegistration[]): Disposable {
    const added = [...entries];
    this.#entries.push(...added);

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      this.#entries = this.#entries.filter((e) => !added.includes(e));
    });
  }

  /** Current composition, in registration order. */
  list(): readonly SurfaceRegistration[] {
    return [...this.#entries];
  }
}

/**
 * Resolves and registers a feature's surface entry refs. `entryDir` is the
 * feature entry file's directory — relative refs resolve against it, mirroring
 * how the manifest resolves feature refs against its own directory.
 */
export function registerSurfaceContributions(
  registry: SurfaceRegistry,
  featureId: string,
  surfaces: readonly string[],
  entryDir: string,
): Disposable {
  const registrations = surfaces.map((ref) => {
    if (typeof ref !== "string" || ref.length === 0) {
      throw new Error(
        `Feature ${featureId} has an invalid surface entry ref: ${String(ref)}`,
      );
    }
    return {
      featureId,
      entry: isAbsolute(ref) ? ref : resolve(entryDir, ref),
    };
  });
  return registry.register(registrations);
}
