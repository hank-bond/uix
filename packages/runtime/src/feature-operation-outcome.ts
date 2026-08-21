// Structured internal outcomes for feature state, facet, restoration, and installation operations.

type FeatureOperationLane = "workspace" | "agent";

type FeatureOperationPhase =
  | "state"
  | "contribution"
  | "registration"
  | "restoration";

interface FeatureOperationOutcomeBase {
  readonly featureId: string;
  readonly lane: FeatureOperationLane;
  readonly phase: FeatureOperationPhase;
  readonly facet?: string;
}

interface SucceededFeatureOperation extends FeatureOperationOutcomeBase {
  readonly status: "succeeded";
}

interface FailedFeatureOperation extends FeatureOperationOutcomeBase {
  readonly status: "failed";
  /** The exact thrown value. Operation accounting does not normalize it. */
  readonly error: unknown;
}

interface BlockedFeatureOperation extends FeatureOperationOutcomeBase {
  readonly status: "blocked";
  /** The original upstream failure that blocked this operation. */
  readonly error: unknown;
}

/** Preserve one feature operation's exact identity and original failure. */
export type FeatureOperationOutcome =
  | SucceededFeatureOperation
  | FailedFeatureOperation
  | BlockedFeatureOperation;

export function toSucceededOperationOutcome(
  featureId: string,
  lane: FeatureOperationLane,
  phase: FeatureOperationPhase,
  facet?: string,
): FeatureOperationOutcome {
  return {
    featureId,
    lane,
    phase,
    ...(facet && { facet }),
    status: "succeeded",
  };
}

export function toFailedOperationOutcome(
  featureId: string,
  lane: FeatureOperationLane,
  phase: FeatureOperationPhase,
  error: unknown,
  facet?: string,
): FeatureOperationOutcome {
  return {
    featureId,
    lane,
    phase,
    ...(facet && { facet }),
    status: "failed",
    error,
  };
}

export function toBlockedOperationOutcome(
  featureId: string,
  lane: FeatureOperationLane,
  phase: FeatureOperationPhase,
  facet: string,
  error: unknown,
): FeatureOperationOutcome {
  return {
    featureId,
    lane,
    phase,
    facet,
    status: "blocked",
    error,
  };
}
