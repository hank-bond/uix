import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceClient } from "@uix/api/workspace";

import type { ActionInvocationSource } from "./workspace/action-invocation-source";
import type { AttachmentWebAddress } from "./workspace/attachment-web-address";
import type { SessionLocationAdapter } from "./workspace/session-location";

const fakes = vi.hoisted(() => ({
  createRoot: vi.fn(),
  installSurfaceSharedModules: vi.fn(),
  render: vi.fn(),
  unmount: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: fakes.createRoot,
}));
vi.mock("./workspace/Workspace", () => ({
  Workspace: () => null,
}));
vi.mock("./workspace/surface-shared-modules", () => ({
  installSurfaceSharedModules: fakes.installSurfaceSharedModules,
}));

import { mountWorkspaceClient } from "./workspace";

describe("mountWorkspaceClient", () => {
  it("installs surface modules and disposes its React root idempotently", () => {
    fakes.createRoot.mockReturnValue({
      render: fakes.render,
      unmount: fakes.unmount,
    });
    const target = {} as HTMLElement;
    const client: WorkspaceClient = {
      workspaceId: "workspace-1",
      request: vi.fn(),
      subscribe: vi.fn(),
    };
    const actionInvocationSource: ActionInvocationSource = {
      subscribe: vi.fn(() => () => undefined),
    };
    const sessionLocationAdapter: SessionLocationAdapter = {
      synchronize: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const attachmentWebAddress: AttachmentWebAddress = {
      getSnapshot: () => ({
        toFeatureRootUrl: (featureId) =>
          `https://host.example/viewpoints/binding/${featureId}/`,
      }),
      subscribe: vi.fn(() => () => undefined),
    };

    const mounted = mountWorkspaceClient({
      target,
      client,
      sessionLocationAdapter,
      actionInvocationSource,
      attachmentWebAddress,
    });

    expect(fakes.installSurfaceSharedModules).toHaveBeenCalledOnce();
    expect(fakes.createRoot).toHaveBeenCalledWith(target);
    expect(fakes.render).toHaveBeenCalledOnce();
    const strictMode = fakes.render.mock.calls[0]?.[0] as ReactElement<{
      children: ReactElement<{
        address: AttachmentWebAddress;
        children: ReactElement<{ children: ReactElement }>;
      }>;
    }>;
    const addressProvider = strictMode.props.children;
    expect(addressProvider.props.address).toBe(attachmentWebAddress);
    expect(addressProvider.props.children.props.children.props).toMatchObject({
      sessionLocationAdapter,
      actionInvocationSource,
    });

    mounted[Symbol.dispose]();
    mounted[Symbol.dispose]();
    expect(fakes.unmount).toHaveBeenCalledOnce();
  });
});
