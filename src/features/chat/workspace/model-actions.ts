import type { ActionContribution } from "@uix/api/workspace";

import type { ModelPickerScope } from "./model-filter";

export function createModelActions(
  openModelPicker: (scope: ModelPickerScope) => void,
): ActionContribution {
  return {
    models: {
      title: "Models",
      children: {
        favorites: {
          title: "Favorite Models",
          run: () => openModelPicker("favorites"),
        },
        all: {
          title: "All Models",
          run: () => openModelPicker("all"),
        },
      },
    },
  };
}
