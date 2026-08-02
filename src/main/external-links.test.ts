import type {
  Event,
  HandlerDetails,
  WebContents,
  WebContentsWillNavigateEventParams,
} from "electron";
import { describe, expect, it, vi } from "vitest";

import { bindExternalWebLinks, isExternalWebUrl } from "./external-links";

type WindowOpenHandler = Parameters<WebContents["setWindowOpenHandler"]>[0];
type WillNavigateListener = (
  event: Event<WebContentsWillNavigateEventParams>,
) => void;

function createWebContentsHarness(): {
  webContents: WebContents;
  getWindowOpenHandler: () => WindowOpenHandler | undefined;
  getWillNavigateListener: () => WillNavigateListener | undefined;
} {
  let windowOpenHandler: WindowOpenHandler | undefined;
  let willNavigateListener: WillNavigateListener | undefined;
  const webContents = {
    setWindowOpenHandler(handler: WindowOpenHandler) {
      windowOpenHandler = handler;
    },
    on(event: string, listener: WillNavigateListener) {
      if (event === "will-navigate") willNavigateListener = listener;
      return webContents;
    },
    off(event: string, listener: WillNavigateListener) {
      if (event === "will-navigate" && willNavigateListener === listener) {
        willNavigateListener = undefined;
      }
      return webContents;
    },
    isDestroyed: () => false,
    getURL: () => "uix-resource://uix.local/index.html",
  } as unknown as WebContents;

  return {
    webContents,
    getWindowOpenHandler: () => windowOpenHandler,
    getWillNavigateListener: () => willNavigateListener,
  };
}

describe("external web links", () => {
  it("accepts only absolute HTTP and HTTPS URLs", () => {
    expect(isExternalWebUrl("https://uix.sh/docs")).toBe(true);
    expect(isExternalWebUrl("http://localhost:3000/path")).toBe(true);
    expect(isExternalWebUrl("/relative")).toBe(false);
    expect(isExternalWebUrl("mailto:pilot@example.com")).toBe(false);
    expect(isExternalWebUrl("file:///Users/work/secret.txt")).toBe(false);
    expect(isExternalWebUrl("javascript:alert(1)")).toBe(false);
  });

  it("opens approved new contexts externally and denies Electron windows", async () => {
    const harness = createWebContentsHarness();
    const openExternal = vi.fn<(_: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    using _binding = bindExternalWebLinks(harness.webContents, openExternal);

    const result = harness.getWindowOpenHandler()!({
      url: "https://uix.sh/docs",
    } as HandlerDetails);
    await Promise.resolve();

    expect(result).toEqual({ action: "deny" });
    expect(openExternal).toHaveBeenCalledWith("https://uix.sh/docs");
  });

  it("denies unsupported new contexts without opening them externally", () => {
    const harness = createWebContentsHarness();
    const openExternal = vi.fn();
    using _binding = bindExternalWebLinks(harness.webContents, openExternal);

    const result = harness.getWindowOpenHandler()!({
      url: "file:///Users/work/secret.txt",
    } as HandlerDetails);

    expect(result).toEqual({ action: "deny" });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("prevents same-window navigation", () => {
    const harness = createWebContentsHarness();
    using _binding = bindExternalWebLinks(harness.webContents, vi.fn());
    const preventDefault = vi.fn();

    harness.getWillNavigateListener()!({
      url: "https://uix.sh/docs",
      preventDefault,
    } as unknown as Event<WebContentsWillNavigateEventParams>);

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("allows the shell to reload its current URL", () => {
    const harness = createWebContentsHarness();
    using _binding = bindExternalWebLinks(harness.webContents, vi.fn());
    const preventDefault = vi.fn();

    harness.getWillNavigateListener()!({
      url: "uix-resource://uix.local/index.html",
      preventDefault,
    } as unknown as Event<WebContentsWillNavigateEventParams>);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
