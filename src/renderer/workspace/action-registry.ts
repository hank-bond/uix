import type {
  ActionContribution,
  ActionContributionUpdater,
  ActionDescriptor,
  ActionInvocationResult,
  RegisterActionContribution,
} from "@uix/api/actions";

import {
  normalizeActionContribution,
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
}

export class ActionRegistry implements Disposable {
  readonly #byId = new Map<string, RegisteredAction>();
  readonly #registeredContributions: RegisteredActionContribution[] = [];
  readonly #listeners = new Set<Listener>();
  #snapshot: readonly ActionDescriptor[] = [];
  #disposed = false;

  forFeature(owner: string): RegisterActionContribution {
    return (contribution) => this.#registerContribution(owner, contribution);
  }

  getSnapshot(): readonly ActionDescriptor[] {
    return this.#snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
    };
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
    if (!action.registration.descriptor.enabled) {
      return { status: "not_invoked", reason: "disabled" };
    }

    action.running = true;
    this.#publishSnapshot();
    const run = action.registration.run;
    try {
      await run();
      return { status: "completed" };
    } finally {
      if (this.#byId.get(id) === action) {
        action.running = false;
        this.#publishSnapshot();
      }
    }
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#byId.clear();
    this.#registeredContributions.length = 0;
    this.#listeners.clear();
    this.#snapshot = [];
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
    };
    this.#registeredContributions.push(registeredContribution);
    this.#addToIndex(registeredContribution.actions);
    this.#publishSnapshot();

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
    this.#addToIndex(nextActions);
    this.#publishSnapshot();
  }

  #removeContribution(
    registeredContribution: RegisteredActionContribution,
  ): void {
    const index = this.#registeredContributions.indexOf(registeredContribution);
    if (index === -1) return;
    this.#removeFromIndex(registeredContribution.actions);
    this.#registeredContributions.splice(index, 1);
    if (!this.#disposed) this.#publishSnapshot();
  }

  #assertIdsAvailable(
    registrations: readonly ActionRegistration[],
    replacedActions = new Set<RegisteredAction>(),
  ): void {
    for (const registration of registrations) {
      const existing = this.#byId.get(registration.id);
      if (existing && !replacedActions.has(existing)) {
        throw new Error(
          `Action already registered: ${registration.id} (owner ${registration.descriptor.owner})`,
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

  #publishSnapshot(): void {
    this.#snapshot = this.#registeredContributions.flatMap((contribution) =>
      contribution.actions.map((action) => ({
        ...action.registration.descriptor,
        running: action.running,
      })),
    );
    for (const listener of this.#listeners) listener();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("ActionRegistry is disposed");
  }
}
