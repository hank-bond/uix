// Keeps Agent operations and Workspace feature reload outside each other's lexical scopes.

/** A non-waiting reader/writer gate for one Workspace Agent runtime's reload. */
export class ReloadAdmission {
  #activeOperations = 0;
  #reloadActive = false;

  /** Admit one reload-sensitive operation until the returned capability disposes. */
  acquireOperation(label: string): Disposable {
    if (this.#reloadActive) {
      throw new Error(`${label} cannot start while Workspace reload is active`);
    }
    this.#activeOperations += 1;
    let disposed = false;
    return {
      [Symbol.dispose]: () => {
        if (disposed) return;
        disposed = true;
        this.#activeOperations -= 1;
      },
    };
  }

  /** Admit reload only when no operation admission or reload admission is active. */
  acquireReload(): Disposable {
    if (this.#reloadActive)
      throw new Error("Workspace reload is already active");
    if (this.#activeOperations > 0) {
      throw new Error("Cannot reload while an Agent operation is active");
    }
    this.#reloadActive = true;
    let disposed = false;
    return {
      [Symbol.dispose]: () => {
        if (disposed) return;
        disposed = true;
        this.#reloadActive = false;
      },
    };
  }
}
