import { defineFeature } from "@uix/api/feature";

import { bashTool } from "./bash";
import { editTool } from "./edit";
import { readTool } from "./read";
import { writeTool } from "./write";

export default defineFeature({
  id: "pi_tools",
  contribute: () => ({
    agentToolOverrides: [readTool, writeTool, editTool, bashTool],
  }),
});
