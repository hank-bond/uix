import { describe, expect, it } from "vitest";

import { ReloadAdmission } from "./reload-admission";

describe("ReloadAdmission", () => {
  it("rejects reload until every operation admission disposes", () => {
    const admission = new ReloadAdmission();
    const first = admission.acquireOperation("first operation");
    const second = admission.acquireOperation("second operation");

    expect(() => admission.acquireReload()).toThrow(
      "Agent operation is active",
    );
    first[Symbol.dispose]();
    expect(() => admission.acquireReload()).toThrow(
      "Agent operation is active",
    );
    second[Symbol.dispose]();

    using _reload = admission.acquireReload();
  });

  it("rejects operations until the reload admission disposes", () => {
    const admission = new ReloadAdmission();
    const reload = admission.acquireReload();

    expect(() => admission.acquireOperation("Canvas writeback")).toThrow(
      "Canvas writeback cannot start while Workspace reload is active",
    );
    expect(() => admission.acquireReload()).toThrow(
      "Workspace reload is already active",
    );
    reload[Symbol.dispose]();
    reload[Symbol.dispose]();

    using _operation = admission.acquireOperation("Canvas writeback");
  });

  it("disposes operation admissions idempotently", () => {
    const admission = new ReloadAdmission();
    const operation = admission.acquireOperation("operation");

    operation[Symbol.dispose]();
    operation[Symbol.dispose]();

    using _reload = admission.acquireReload();
  });
});
