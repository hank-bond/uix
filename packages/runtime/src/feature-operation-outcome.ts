// Structured internal outcomes for feature state, facet, restoration, and installation operations.

type FeatureOperationLane = "workspace" | "agent";

type FeatureOperationPhase =
  | "state"
  | "contribution"
  | "registration"
  | "restoration"
  | "installation";

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
