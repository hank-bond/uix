import type {
  ActionContribution,
  ActionCatalog,
  ActionContributionUpdater,
  ActionInvocationResult,
  RegisterActionContribution,
} from "@uix/api/actions";

import {
  normalizeActionContribution,
  type ActionDefaultBindingMap,
  type ActionRegistration,
} from "./action-normalization";

type Listener = () => void;

interface RegisteredAction {
  registration: ActionRegistration;
  running: boolean;
}

interface RegisteredActionContribution {
  readonly owner: string;
  actions: RegisteredAction[];
  defaultBindings: ActionDefaultBindingMap;
}

export class ActionRegistry implements Disposable {
  readonly #byId = new Map<string, RegisteredAction>();
  readonly #registeredContributions: RegisteredActionContribution[] = [];
  readonly #catalogListeners = new Set<Listener>();
  readonly #defaultBindingListeners = new Set<Listener>();
  #catalogSnapshot: ActionCatalog = [];
  #defaultBindingsSnapshot: ActionDefaultBindingMap = Object.freeze({});
  #disposed = false;

  forFeature(owner: string): RegisterActionContribution {
    return (contribution) => this.#registerContribution(owner, contribution);
  }

  getCatalogSnapshot(): ActionCatalog {
    return this.#catalogSnapshot;
  }

  subscribeToCatalog(listener: Listener): () => void {
    return this.#subscribe(this.#catalogListeners, listener);
  }

  getDefaultBindingsSnapshot(): ActionDefaultBindingMap {
    return this.#defaultBindingsSnapshot;
  }

  subscribeToDefaultBindings(listener: Listener): () => void {
    return this.#subscribe(this.#defaultBindingListeners, listener);
  }

  async invoke(id: string): Promise<ActionInvocationResult> {
    this.#assertActive();
    const action = this.#byId.get(id);
    if (!action) {
      return { status: "not_invoked", reason: "not_found" };
    }
    if (action.running) {
      return { status: "not_invoked", reason: "already_running" };
    }
    if (!action.registration.catalogEntry.enabled) {
      return { status: "not_invoked", reason: "disabled" };
    }

    action.running = true;
    this.#publishCatalogSnapshot();
    const run = action.registration.run;
    try {
      await run();
      return { status: "completed" };
    } finally {
      if (this.#byId.get(id) === action) {
        action.running = false;
        this.#publishCatalogSnapshot();
      }
    }
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#byId.clear();
    this.#registeredContributions.length = 0;
    this.#catalogListeners.clear();
    this.#defaultBindingListeners.clear();
    this.#catalogSnapshot = [];
    this.#defaultBindingsSnapshot = Object.freeze({});
  }

  #registerContribution(
    owner: string,
    contribution: ActionContribution,
  ): ActionContributionUpdater {
    this.#assertActive();
    const normalized = normalizeActionContribution(owner, contribution);
    this.#assertIdsAvailable(normalized.registrations);

    const registeredContribution: RegisteredActionContribution = {
      owner,
      actions: normalized.registrations.map((registration) => ({
        registration,
        running: false,
      })),
      defaultBindings: normalized.defaultBindings,
    };
    this.#registeredContributions.push(registeredContribution);
    this.#addToIndex(registeredContribution.actions);
    this.#publishCatalogSnapshot();
    this.#publishDefaultBindingsIfChanged();

    return {
      update: (next) => this.#updateContribution(registeredContribution, next),
      [Symbol.dispose]: () => this.#removeContribution(registeredContribution),
    };
  }

  #updateContribution(
    registeredContribution: RegisteredActionContribution,
    contribution: ActionContribution,
  ): void {
    this.#assertActive();
    if (!this.#registeredContributions.includes(registeredContribution)) {
      throw new Error("Action contribution registration is disposed");
    }

    const normalized = normalizeActionContribution(
      registeredContribution.owner,
      contribution,
    );
    this.#assertIdsAvailable(
      normalized.registrations,
      new Set(registeredContribution.actions),
    );

    const previousById = new Map(
      registeredContribution.actions.map((action) => [
        action.registration.id,
        action,
      ]),
    );
    const nextActions = normalized.registrations.map((registration) => {
      const previous = previousById.get(registration.id);
      if (previous) {
        previous.registration = registration;
        return previous;
      }
      return { registration, running: false };
    });

    this.#removeFromIndex(registeredContribution.actions);
    registeredContribution.actions = nextActions;
    registeredContribution.defaultBindings = normalized.defaultBindings;
    this.#addToIndex(nextActions);
    this.#publishCatalogSnapshot();
    this.#publishDefaultBindingsIfChanged();
  }

  #removeContribution(
    registeredContribution: RegisteredActionContribution,
  ): void {
    const index = this.#registeredContributions.indexOf(registeredContribution);
    if (index === -1) return;
    this.#removeFromIndex(registeredContribution.actions);
    this.#registeredContributions.splice(index, 1);
    if (!this.#disposed) {
      this.#publishCatalogSnapshot();
      this.#publishDefaultBindingsIfChanged();
    }
  }

  #assertIdsAvailable(
    registrations: readonly ActionRegistration[],
    replacedActions = new Set<RegisteredAction>(),
  ): void {
    for (const registration of registrations) {
      const existing = this.#byId.get(registration.id);
      if (existing && !replacedActions.has(existing)) {
        throw new Error(
          `Action already registered: ${registration.id} (owner ${registration.catalogEntry.owner})`,
        );
      }
    }
  }

  #addToIndex(actions: readonly RegisteredAction[]): void {
    for (const action of actions) {
      this.#byId.set(action.registration.id, action);
    }
  }

  #removeFromIndex(actions: readonly RegisteredAction[]): void {
    for (const action of actions) {
      const id = action.registration.id;
      if (this.#byId.get(id) === action) this.#byId.delete(id);
    }
  }

  #publishCatalogSnapshot(): void {
    this.#catalogSnapshot = this.#registeredContributions.flatMap(
      (contribution) =>
        contribution.actions.map((action) => ({
          ...action.registration.catalogEntry,
          running: action.running,
        })),
    );
    for (const listener of this.#catalogListeners) listener();
  }

  #publishDefaultBindingsIfChanged(): void {
    const next = Object.assign(
      {},
      ...this.#registeredContributions.map(
        (contribution) => contribution.defaultBindings,
      ),
    ) as ActionDefaultBindingMap;
    if (hasSameDefaultBindings(this.#defaultBindingsSnapshot, next)) return;
    this.#defaultBindingsSnapshot = Object.freeze(next);
    for (const listener of this.#defaultBindingListeners) listener();
  }

  #subscribe(listeners: Set<Listener>, listener: Listener): () => void {
    this.#assertActive();
    listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(listener);
    };
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("ActionRegistry is disposed");
  }
}

function hasSameDefaultBindings(
  left: ActionDefaultBindingMap,
  right: ActionDefaultBindingMap,
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(
    ([actionId, shortcut]) =>
      Object.hasOwn(right, actionId) && right[actionId] === shortcut,
  );
}
