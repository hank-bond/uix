// feature logger contract.
//
// The minimal structured-logging surface features receive via
// FeatureContext.log. One call shape: `log.info({ ...fields }, "event_name")`.
// The cockpit binds a feature-id-scoped child of its own logger; keeping this
// a pino-free subset means feature code never depends on the main-process
// logging stack (and the interface stays web-typecheck-safe).

export type FeatureLogFn = (
  fields: Record<string, unknown>,
  message: string,
) => void;

export interface FeatureLogger {
  trace: FeatureLogFn;
  debug: FeatureLogFn;
  info: FeatureLogFn;
  warn: FeatureLogFn;
  error: FeatureLogFn;
}
