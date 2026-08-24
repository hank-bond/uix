import { describe, expect, it, vi } from "vitest";

import type { WorkspaceClient } from "@uix/api/workspace";

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

    const mounted = mountWorkspaceClient({ target, client });

    expect(fakes.installSurfaceSharedModules).toHaveBeenCalledOnce();
    expect(fakes.createRoot).toHaveBeenCalledWith(target);
    expect(fakes.render).toHaveBeenCalledOnce();

    mounted[Symbol.dispose]();
    mounted[Symbol.dispose]();
    expect(fakes.unmount).toHaveBeenCalledOnce();
  });
});
