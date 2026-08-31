import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  spawn: vi.fn(),
  once: vi.fn(),
  unref: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: fakes.spawn }));

import { createServerExternalWebLinkLauncher } from "./external-links";

beforeEach(() => {
  fakes.spawn.mockReset();
  fakes.once.mockReset();
  fakes.unref.mockReset();
  fakes.spawn.mockReturnValue({ once: fakes.once, unref: fakes.unref });
});

describe("server external web links", () => {
  it.each([
    ["darwin", "open", ["https://uix.sh/auth"]],
    [
      "win32",
      "rundll32",
      ["url.dll,FileProtocolHandler", "https://uix.sh/auth"],
    ],
    ["linux", "xdg-open", ["https://uix.sh/auth"]],
  ] as const)(
    "uses the %s default-browser command",
    (platform, command, args) => {
      const launch = createServerExternalWebLinkLauncher(platform);

      launch("https://uix.sh/auth");

      expect(fakes.spawn).toHaveBeenCalledWith(command, args, {
        detached: true,
        stdio: "ignore",
      });
      expect(fakes.once).toHaveBeenCalledWith("error", expect.any(Function));
      expect(fakes.unref).toHaveBeenCalledOnce();
    },
  );

  it("rejects non-web URLs before process creation", () => {
    const launch = createServerExternalWebLinkLauncher("linux");

    launch("file:///private/auth.json");

    expect(fakes.spawn).not.toHaveBeenCalled();
  });
});
