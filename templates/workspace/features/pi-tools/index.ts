// The bare workspace feature: editable passthrough providers for Pi's core tools.

import { defineFeature } from "@uix/api/feature";

import { bashTool } from "./bash";
import { editTool } from "./edit";
import { readTool } from "./read";
import { writeTool } from "./write";

export const feature = defineFeature({
  id: "pi_tools",
  contribute: () => ({
    agentTools: [readTool, writeTool, editTool, bashTool],
  }),
});
