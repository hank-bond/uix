import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  useActionCatalog,
  useActionContribution,
  useInvokeAction,
  WorkspaceActionsProvider,
} from "@uix/api/workspace";
import type {
  ActionDescriptor,
  ActionInvocationResult,
} from "@uix/api/actions";

const descriptor: ActionDescriptor = {
  id: "chat.models.favorites",
  owner: "chat",
  title: "Favorite Models",
  path: ["Models", "Favorite Models"],
  enabled: true,
  running: false,
  conflictsWith: [],
};

describe("workspace action hooks", () => {
  it("reads the catalog and exposes the shared invocation operation", async () => {
    const getSnapshot = vi.fn(() => [descriptor]);
    const subscribe = vi.fn(() => () => undefined);
    const invoke = vi.fn(
      (): Promise<ActionInvocationResult> =>
        Promise.resolve({ status: "completed" }),
    );
    let invokeFromHook:
      | ((id: string) => Promise<ActionInvocationResult>)
      | undefined;

    function Probe() {
      const actions = useActionCatalog();
      invokeFromHook = useInvokeAction();
      return <span>{actions.map(({ title }) => title).join(", ")}</span>;
    }

    const html = renderToStaticMarkup(
      <WorkspaceActionsProvider
        getSnapshot={getSnapshot}
        subscribe={subscribe}
        invoke={invoke}
      >
        <Probe />
      </WorkspaceActionsProvider>,
    );

    expect(html).toContain("Favorite Models");
    await expect(invokeFromHook?.("chat.models.favorites")).resolves.toEqual({
      status: "completed",
    });
    expect(invoke).toHaveBeenCalledWith("chat.models.favorites");
  });

  it("fails clearly when workspace or feature action wiring is missing", () => {
    function CatalogProbe() {
      useActionCatalog();
      return null;
    }
    function ContributionProbe() {
      useActionContribution({});
      return null;
    }

    expect(() => renderToStaticMarkup(<CatalogProbe />)).toThrow(
      "WorkspaceActionsProvider is missing",
    );
    expect(() => renderToStaticMarkup(<ContributionProbe />)).toThrow(
      "FeatureActionsProvider is missing",
    );
  });
});
