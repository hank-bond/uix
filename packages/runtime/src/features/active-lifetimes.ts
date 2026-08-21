// Owns the current feature generation's mixed synchronous and asynchronous lifetimes.

import { AsyncDisposableBag } from "../lifecycle";

/**
 * One awaitable owner for active feature lifetimes. Replacement drains the
 * previous generation completely before admitting additions to the next one.
 * Shutdown joins any replacement already in progress, then drains the active
 * generation exactly once.
 */
export class ActiveFeatureLifetimeOwner implements AsyncDisposable {
  #active = new AsyncDisposableBag();
  #transition: Promise<void> = Promise.resolve();
  #replacement: Promise<void> | undefined;
  #disposal: Promise<void> | undefined;
  #disposing = false;

  add<Lifetime extends Disposable | AsyncDisposable>(
    lifetime: Lifetime,
  ): Lifetime {
    if (this.#disposing) {
      throw new Error("Active feature lifetime owner is disposing");
    }
    if (this.#replacement) {
      throw new Error("Active feature lifetimes are being replaced");
    }
    return this.#active.add(lifetime);
  }

  /** Drain the active generation and open a fresh generation for additions. */
  replace(): Promise<void> {
    if (this.#disposing) {
      return Promise.reject(
        new Error("Active feature lifetime owner is disposing"),
      );
    }
    if (this.#replacement) return this.#replacement;

    const retired = this.#active;
    const replacement = new AsyncDisposableBag();
    const operation = this.#transition.then(async () => {
      try {
        await retired[Symbol.asyncDispose]();
      } finally {
        this.#active = replacement;
      }
    });
    this.#replacement = operation.finally(() => {
      this.#replacement = undefined;
    });
    this.#transition = this.#replacement.catch(() => undefined);
    return this.#replacement;
  }

  [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposing = true;
    this.#disposal = this.#transition.then(() =>
      this.#active[Symbol.asyncDispose](),
    );
    return this.#disposal;
  }
}
