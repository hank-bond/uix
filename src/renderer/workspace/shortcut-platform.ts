import type { ShortcutPlatform } from "@uix/api/shortcuts";

interface BrowserPlatformInfo {
  readonly userAgentData?: {
    readonly platform: string;
  };
  readonly platform: string;
}

export function toShortcutPlatform(
  browserPlatform: BrowserPlatformInfo,
): ShortcutPlatform {
  // UA Client Hints are not universal; retain the legacy browser value as a
  // compatibility fallback rather than coupling detection to Electron.
  const platform =
    browserPlatform.userAgentData?.platform ?? browserPlatform.platform;
  return platform.toLowerCase().startsWith("mac") ? "macos" : "other";
}
