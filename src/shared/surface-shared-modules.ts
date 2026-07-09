// surface runtime shared-module contract.
//
// Surface modules are esbuild-bundled with their feature-local code inlined,
// but the blessed shared set below must resolve to the *page's* live
// instances (one React, one typebox, one @uix/api) rather than being bundled
// per surface. The pipeline maps these bare specifiers to virtual modules
// that read the page-provided global; the page populates that global at boot
// (src/renderer/workspace/provide-shared-modules.ts) before any surface loads.

export const SurfaceSharedModules = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "typebox",
  "typebox/value",
  "@uix/api/workspace",
  "@uix/api/settings",
  "@uix/api/agent-channels",
  "@uix/api/resources",
] as const;

export type SurfaceSharedModule = (typeof SurfaceSharedModules)[number];

/** The well-known global the page hangs the shared module instances on. */
export const SurfaceSharedGlobal = "__uixSharedModules";
