import type {
  ActionContribution,
  ActionCatalog,
  ActionCatalogEntry,
  ActionId,
  ActionContributionUpdater,
  ActionRun,
  ActionInvocationResult,
  KeybindingMap,
  RegisterActionContribution,
} from "@uix/api/actions";
import type { ShortcutPlatform } from "@uix/api/shortcuts";

import { toActionBindingProjection } from "./action-binding-projection";
import {
  normalizeActionContribution,
  type ActionDefaultBindingMap,
  type ActionRegistration,
} from "./action-normalization";

type Listener = () => void;
type ActionInvocationSource = "direct" | "keyboard";

interface ActionInvocationDiagnostic {
  readonly actionId: ActionId;
  readonly error: unknown;
}

interface RegisteredAction {
  readonly id: ActionId;
  catalogEntry: ActionCatalogEntry;
  run: ActionRun;
  running: boolean;
}

interface RegisteredActionContribution {
  readonly owner: string;
  actions: RegisteredAction[];
  defaultBindings: ActionDefaultBindingMap;
}

interface ActionRegistryOptions {
  shortcutPlatform: ShortcutPlatform;
}

export class ActionRegistry implements Disposable {
  readonly #byId = new Map<string, RegisteredAction>();
  readonly #registeredContributions: RegisteredActionContribution[] = [];
  readonly #catalogListeners = new Set<Listener>();
  readonly #defaultBindingListeners = new Set<Listener>();
  readonly #invocationDiagnosticListeners = new Set<
    (diagnostic: ActionInvocationDiagnostic) => void
  >();
  readonly #shortcutPlatform: ShortcutPlatform;
  #catalogSnapshot: ActionCatalog = [];
  #defaultBindingsSnapshot: ActionDefaultBindingMap = Object.freeze({});
  #confirmedBindingsSnapshot: Readonly<KeybindingMap> | undefined;
  #unresolvedBindingsSnapshot: Readonly<KeybindingMap> | undefined;
  #disposed = false;

  constructor(options: ActionRegistryOptions) {
    this.#shortcutPlatform = options.shortcutPlatform;
  }

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

  getConfirmedBindingsSnapshot(): Readonly<KeybindingMap> | undefined {
    return this.#confirmedBindingsSnapshot;
  }

  getUnresolvedBindingsSnapshot(): Readonly<KeybindingMap> | undefined {
    return this.#unresolvedBindingsSnapshot;
  }

  setConfirmedBindings(bindings: KeybindingMap): void {
    this.#assertActive();
    const next = Object.freeze({ ...bindings });
    if (
      this.#confirmedBindingsSnapshot &&
      hasSameBindings(this.#confirmedBindingsSnapshot, next)
    ) {
      return;
    }
    this.#confirmedBindingsSnapshot = next;
    this.#publishCatalogSnapshot();
  }

  subscribeToInvocationDiagnostics(
    listener: (diagnostic: ActionInvocationDiagnostic) => void,
  ): () => void {
    this.#assertActive();
    this.#invocationDiagnosticListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#invocationDiagnosticListeners.delete(listener);
    };
  }

  async invoke(
    id: string,
    source: ActionInvocationSource = "direct",
  ): Promise<ActionInvocationResult> {
    this.#assertActive();
    const action = this.#byId.get(id);
    if (!action) {
      return { status: "not_invoked", reason: "not_found" };
    }
    if (action.running) {
      return { status: "not_invoked", reason: "already_running" };
    }
    if (!action.catalogEntry.enabled) {
      return { status: "not_invoked", reason: "disabled" };
    }

    action.running = true;
    this.#publishCatalogSnapshot();
    const run = action.run;
    try {
      await run();
      return { status: "completed" };
    } catch (error) {
      if (source === "keyboard") {
        const diagnostic = {
          actionId: action.id,
          error,
        };
        for (const listener of this.#invocationDiagnosticListeners) {
          listener(diagnostic);
        }
      }
      throw error;
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
    this.#invocationDiagnosticListeners.clear();
    this.#catalogSnapshot = [];
    this.#defaultBindingsSnapshot = Object.freeze({});
    this.#confirmedBindingsSnapshot = undefined;
    this.#unresolvedBindingsSnapshot = undefined;
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
        ...registration,
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
      registeredContribution.actions.map((action) => [action.id, action]),
    );
    const nextActions = normalized.registrations.map((registration) => {
      const previous = previousById.get(registration.id);
      if (previous) {
        previous.catalogEntry = registration.catalogEntry;
        previous.run = registration.run;
        return previous;
      }
      return { ...registration, running: false };
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
      this.#byId.set(action.id, action);
    }
  }

  #removeFromIndex(actions: readonly RegisteredAction[]): void {
    for (const action of actions) {
      const id = action.id;
      if (this.#byId.get(id) === action) this.#byId.delete(id);
    }
  }

  #publishCatalogSnapshot(): void {
    const registeredCatalog = this.#registeredContributions.flatMap(
      (contribution) =>
        contribution.actions.map((action) => ({
          ...action.catalogEntry,
          running: action.running,
        })),
    );
    if (!this.#confirmedBindingsSnapshot) {
      this.#catalogSnapshot = registeredCatalog;
      this.#unresolvedBindingsSnapshot = undefined;
    } else {
      const projection = toActionBindingProjection(
        registeredCatalog,
        this.#confirmedBindingsSnapshot,
        this.#shortcutPlatform,
      );
      this.#catalogSnapshot = projection.catalog;
      if (
        !this.#unresolvedBindingsSnapshot ||
        !hasSameBindings(
          this.#unresolvedBindingsSnapshot,
          projection.unresolvedBindings,
        )
      ) {
        this.#unresolvedBindingsSnapshot = Object.freeze({
          ...projection.unresolvedBindings,
        });
      }
    }
    for (const listener of this.#catalogListeners) listener();
  }

  #publishDefaultBindingsIfChanged(): void {
    const next = Object.assign(
      {},
      ...this.#registeredContributions.map(
        (contribution) => contribution.defaultBindings,
      ),
    ) as ActionDefaultBindingMap;
    if (hasSameBindings(this.#defaultBindingsSnapshot, next)) return;
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

function hasSameBindings(
  left: Readonly<Record<string, string | null>>,
  right: Readonly<Record<string, string | null>>,
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;
  return leftEntries.every(
    ([actionId, shortcut]) =>
      Object.hasOwn(right, actionId) && right[actionId] === shortcut,
  );
}
