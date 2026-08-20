// Creates atomic Workspace and Agent feature-state ownerships over mixed disposable lifetimes.

import type {
  FeatureStateBuilder,
  FeatureStateKind,
  FeatureStateOf,
} from "@uix/api/feature-state";

import { AsyncDisposableBag } from "./lifecycle";

type FeatureStateFactory<
  Kind extends FeatureStateKind,
  Base extends object,
  Built extends FeatureStateBuilder<Kind, object>,
> = (state: FeatureStateBuilder<Kind, Readonly<Base>>) => Built;

/** Private lifetime authority for one completed feature state. */
interface FeatureStateOwnership<State extends object> extends AsyncDisposable {
  readonly state: Readonly<State>;
}

interface CreateFeatureStateOwnershipOptions<
  Kind extends FeatureStateKind,
  Base extends object,
  Built extends FeatureStateBuilder<Kind, object>,
> {
  readonly lane: Kind;
  readonly base: Base;
  readonly build?: FeatureStateFactory<Kind, Base, Built>;
}

type FeatureStateBuilderStatus =
  | { readonly type: "open" }
  | { readonly type: "failed"; readonly error: Error }
  | { readonly type: "finalized" };

/**
 * Create one feature state and its private lifetime ownership. Run the optional
 * factory synchronously, then await complete rollback before rejecting a failed
 * creation. The caller must transfer the returned ownership into its lifetime.
 */
export async function createFeatureStateOwnership<
  const Kind extends FeatureStateKind,
  Base extends object,
  Built extends FeatureStateBuilder<Kind, object> = FeatureStateBuilder<
    Kind,
    Readonly<Base>
  >,
>(
  options: CreateFeatureStateOwnershipOptions<Kind, Base, Built>,
): Promise<FeatureStateOwnership<FeatureStateOf<Built>>> {
  const owner = new AsyncDisposableBag();
  const members = { ...options.base } as Record<PropertyKey, unknown>;
  const baseMemberNames = new Set(Reflect.ownKeys(options.base));
  const addedMemberNames = new Set<PropertyKey>();
  const builderState: { status: FeatureStateBuilderStatus } = {
    status: { type: "open" },
  };

  const failBuilder = (error: unknown): never => {
    const normalized = normalizeError(error);
    builderState.status = { type: "failed", error: normalized };
    throw normalized;
  };

  const builder = {
    add(addition: unknown): FeatureStateBuilder<FeatureStateKind, object> {
      assertFeatureStateBuilderOpen(builderState.status, options.lane);

      try {
        const entries = ownEntries(addition);
        for (const [, value] of entries) {
          if (isDisposable(value)) owner.add(value);
        }

        const [name, value] = requireSingleFeatureStateMember(
          entries,
          options.lane,
        );
        assertFeatureStateMemberNameAvailable(
          name,
          baseMemberNames,
          addedMemberNames,
          options.lane,
        );

        Object.defineProperty(members, name, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
        addedMemberNames.add(name);
        return builder;
      } catch (error) {
        return failBuilder(error);
      }
    },
  } as FeatureStateBuilder<FeatureStateKind, object>;

  try {
    if (options.build) {
      const returned = options.build(
        builder as FeatureStateBuilder<Kind, Readonly<Base>>,
      );
      if (returned !== builder) {
        throw new Error(
          `${capitalize(options.lane)} feature state factory must return its builder chain`,
        );
      }
    }
    if (builderState.status.type === "failed") {
      throw builderState.status.error;
    }

    builderState.status = { type: "finalized" };
    const state = Object.freeze(members) as Readonly<FeatureStateOf<Built>>;
    return {
      state,
      [Symbol.asyncDispose]: () => owner[Symbol.asyncDispose](),
    };
  } catch (error) {
    builderState.status = { type: "finalized" };
    const constructionError = normalizeError(error);
    try {
      await owner[Symbol.asyncDispose]();
    } catch (disposalError) {
      throw new AggregateError(
        [constructionError, normalizeError(disposalError)],
        `${capitalize(options.lane)} feature state construction and rollback failed`,
        { cause: disposalError },
      );
    }
    throw constructionError;
  }
}

function assertFeatureStateBuilderOpen(
  status: FeatureStateBuilderStatus,
  lane: FeatureStateKind,
): asserts status is { readonly type: "open" } {
  if (status.type === "failed") throw status.error;
  if (status.type === "finalized") {
    throw new Error(`${capitalize(lane)} feature state is finalized`);
  }
}

function requireSingleFeatureStateMember(
  entries: ReadonlyArray<readonly [string, unknown]>,
  lane: FeatureStateKind,
): readonly [string, unknown] {
  if (entries.length !== 1) {
    throw new Error(
      `${capitalize(lane)} feature state add() requires exactly one own enumerable string member; received ${String(entries.length)}`,
    );
  }
  return entries[0];
}

function assertFeatureStateMemberNameAvailable(
  name: string,
  baseMemberNames: ReadonlySet<PropertyKey>,
  addedMemberNames: ReadonlySet<PropertyKey>,
  lane: FeatureStateKind,
): void {
  if (baseMemberNames.has(name)) {
    throw new Error(
      `${capitalize(lane)} feature state member ${JSON.stringify(name)} collides with substrate base state`,
    );
  }
  if (addedMemberNames.has(name)) {
    throw new Error(
      `${capitalize(lane)} feature state member ${JSON.stringify(name)} was already added`,
    );
  }
}

function ownEntries(value: unknown): Array<readonly [string, unknown]> {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return [];
  }

  const keys = Reflect.ownKeys(value);
  const entries: Array<readonly [string, unknown]> = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      descriptor === undefined ||
      !descriptor.enumerable
    ) {
      continue;
    }
    entries.push([key, Reflect.get(value, key)]);
  }
  return entries;
}

function isDisposable(value: unknown): value is Disposable | AsyncDisposable {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return false;
  }
  return (
    typeof Reflect.get(value, Symbol.asyncDispose) === "function" ||
    typeof Reflect.get(value, Symbol.dispose) === "function"
  );
}

function normalizeError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
