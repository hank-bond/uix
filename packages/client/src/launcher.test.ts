import { describe, expect, it, vi } from "vitest";

import type { LauncherAdapter } from "./launcher/adapter";

const root = vi.hoisted(() => ({
  render: vi.fn(),
  unmount: vi.fn(),
}));
const createRoot = vi.hoisted(() => vi.fn(() => root));

vi.mock("react-dom/client", () => ({ createRoot }));

import { mountLauncherClient } from "./launcher";

describe("mountLauncherClient", () => {
  it("mounts over an adapter and disposes its React root idempotently", () => {
    const target = {} as HTMLElement;
    const adapter: LauncherAdapter = {
      listWorkspaces: () => Promise.resolve([]),
      openWorkspace: () => Promise.resolve("accepted"),
    };

    const mounted = mountLauncherClient({ target, adapter });

    expect(createRoot).toHaveBeenCalledWith(target);
    expect(root.render).toHaveBeenCalledOnce();

    mounted[Symbol.dispose]();
    mounted[Symbol.dispose]();
    expect(root.unmount).toHaveBeenCalledOnce();
  });
});
