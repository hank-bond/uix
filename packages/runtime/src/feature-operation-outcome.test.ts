import { describe, expect, expectTypeOf, it } from "vitest";

import type { FeatureOperationOutcome } from "./feature-operation-outcome";

describe("FeatureOperationOutcome", () => {
  it("preserves operation identity and the original error", () => {
    const error = new Error("state failed");
    const outcome = {
      featureId: "canvas",
      lane: "agent",
      phase: "contribution",
      facet: "tools",
      status: "failed",
      error,
    } satisfies FeatureOperationOutcome;

    expect(outcome.error).toBe(error);
    expectTypeOf(outcome.lane).toEqualTypeOf<"agent">();
    expectTypeOf(outcome.phase).toEqualTypeOf<"contribution">();
  });

  it("distinguishes succeeded, failed, and blocked operations", () => {
    const outcomes = [
      {
        featureId: "canvas",
        lane: "workspace",
        phase: "registration",
        status: "succeeded",
      },
      {
        featureId: "canvas",
        lane: "agent",
        phase: "installation",
        status: "failed",
        error: new Error("install failed"),
      },
      {
        featureId: "canvas",
        lane: "agent",
        phase: "contribution",
        status: "blocked",
        error: new Error("state failed"),
      },
    ] satisfies readonly FeatureOperationOutcome[];

    expect(outcomes.map(({ status }) => status)).toEqual([
      "succeeded",
      "failed",
      "blocked",
    ]);
  });
});
