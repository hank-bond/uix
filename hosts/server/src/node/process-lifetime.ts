// Coordinates signal-triggered shutdown with a host that may still be starting.

import type { ServerHost } from "./server";

/** Owns at most one started host and makes shutdown-before-admission deterministic. */
export class ServerProcessLifetime implements AsyncDisposable {
  #host: ServerHost | undefined;
  #disposal: Promise<void> | undefined;
  #hasReceivedHost = false;
  #isShutdownRequested = false;

  /**
   * Commit a started host into this lifetime.
   * Return false after disposing it when shutdown won the startup race.
   */
  async commit(host: ServerHost): Promise<boolean> {
    if (this.#hasReceivedHost) {
      throw new Error("Server process already received a host");
    }
    this.#hasReceivedHost = true;
    if (this.#isShutdownRequested) {
      const disposal = Promise.resolve().then(() =>
        host[Symbol.asyncDispose](),
      );
      this.#disposal = disposal;
      await disposal;
      return false;
    }
    this.#host = host;
    return true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#isShutdownRequested = true;
    if (this.#disposal) return this.#disposal;
    const host = this.#host;
    if (!host) return Promise.resolve();
    this.#host = undefined;
    const disposal = Promise.resolve().then(() => host[Symbol.asyncDispose]());
    this.#disposal = disposal;
    return disposal;
  }
}
