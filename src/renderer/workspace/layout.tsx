// workspace layout manifest.
//
// Declares which surfaces are active and their order. Surface definitions
// live with their features; the workspace just imports and composes them.

import type { ReactNode } from "react";

import { chatSurface } from "#features/chat/workspace/surface";
import { canvasSurface } from "#features/canvas/workspace/surface";

export const workspaceId = "local";

export interface SurfaceLayout {
  name: string;
  render: () => ReactNode;
}

export const layout: readonly SurfaceLayout[] = [chatSurface, canvasSurface];
