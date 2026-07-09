// page-shared module instances for runtime surfaces.
//
// Surface modules are bundled with the blessed bare specifiers left as
// virtual modules that read this global (src/shared/surface-shared-modules.ts).
// Populating it here — imported first by the page entry — guarantees one
// React (hooks in surface components work), one typebox, one @uix/api.
// Each entry carries `__esModule` and a `default` so esbuild's CJS interop
// resolves default and named imports exactly.

import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import * as typebox from "typebox";
import * as typeboxValue from "typebox/value";
import * as uixAgent from "@uix/api/agent-channels";
import * as uixResources from "@uix/api/resources";
import * as uixSettings from "@uix/api/settings";
import * as uixWorkspace from "@uix/api/workspace";

import {
  SurfaceSharedGlobal,
  type SurfaceSharedModule,
} from "#shared/surface-shared-modules";

function toShared(ns: object): Record<string, unknown> {
  const entries = ns as Record<string, unknown>;
  return { __esModule: true, ...entries, default: entries["default"] ?? ns };
}

const shared: Record<SurfaceSharedModule, Record<string, unknown>> = {
  react: toShared(react),
  "react/jsx-runtime": toShared(jsxRuntime),
  "react-dom": toShared(reactDom),
  "react-dom/client": toShared(reactDomClient),
  typebox: toShared(typebox),
  "typebox/value": toShared(typeboxValue),
  "@uix/api/workspace": toShared(uixWorkspace),
  "@uix/api/settings": toShared(uixSettings),
  "@uix/api/agent-channels": toShared(uixAgent),
  "@uix/api/resources": toShared(uixResources),
};

(globalThis as Record<string, unknown>)[SurfaceSharedGlobal] = shared;
