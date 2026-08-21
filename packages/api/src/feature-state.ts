// Feature-state builder contracts for Workspace and Agent feature states.
//
// A state factory receives one builder over its readonly substrate base and
// returns a chain of single-member additions. The runtime finalizes that chain
// into a shallow-frozen state object. Contribution factories receive the
// completed state type, never the builder's construction authority.

declare const featureStateKind: unique symbol;
declare const featureStateValue: unique symbol;

/** Distinguishes the two feature-state construction paths for the substrate. */
export type FeatureStateKind = "workspace" | "agent";

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type SingleStringMember<Addition extends object> = [keyof Addition] extends [
  never,
]
  ? never
  : [keyof Addition] extends [string]
    ? true extends IsUnion<keyof Addition>
      ? never
      : unknown
    : never;

type NewStateMember<State extends object, Addition extends object> = [
  Extract<keyof Addition, keyof State | "add">,
] extends [never]
  ? unknown
  : never;

/**
 * Add named members while constructing one Workspace or Agent feature state.
 * Return the final builder chain from the state factory. Contribution factories
 * receive the completed state instead of this construction capability.
 */
export type FeatureStateBuilder<
  Kind extends FeatureStateKind,
  State extends object,
> = Readonly<State> & {
  readonly [featureStateKind]: Kind;
  readonly [featureStateValue]: State;

  /**
   * Add exactly one new named member. A disposable member transfers its cleanup
   * capability to the provisional feature-state lifetime before validation
   * completes. Duplicate names and names from the substrate base are invalid.
   */
  add<Addition extends object>(
    addition: Addition &
      SingleStringMember<Addition> &
      NewStateMember<State, Addition>,
  ): FeatureStateBuilder<Kind, Readonly<State & Addition>>;
};

/** Construction capability supplied to a Workspace feature-state factory. */
export type WorkspaceFeatureStateBuilder<State extends object> =
  FeatureStateBuilder<"workspace", State>;

/** Construction capability supplied to an Agent feature-state factory. */
export type AgentFeatureStateBuilder<State extends object> =
  FeatureStateBuilder<"agent", State>;

/** Completed shallow-readonly state supplied to Workspace contributions. */
export type WorkspaceFeatureState<State extends object> = Readonly<State>;

/** Completed shallow-readonly state supplied to Agent contributions. */
export type AgentFeatureState<State extends object> = Readonly<State>;

/** Derive the completed readonly state carried by a construction chain. */
export type FeatureStateOf<Builder> =
  Builder extends FeatureStateBuilder<FeatureStateKind, infer State>
    ? Readonly<State>
    : never;
