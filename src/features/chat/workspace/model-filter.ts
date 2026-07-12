// Picker filtering, extracted pure so it's testable without a DOM.

import type { ModelOption } from "@uix/api/agent-channels";

/** Derive the model's source path without repeating its final model id. */
export function toModelSource(model: ModelOption): string {
  const idSegments = model.id.split("/");
  return [model.provider, ...idSegments.slice(0, -1)].join("/");
}

/**
 * Case-insensitive substring match on provider, id, or display name.
 * A blank (or whitespace-only) query keeps every model.
 */
export function filterModels(
  models: readonly ModelOption[],
  query: string,
): ModelOption[] {
  const filter = query.trim().toLowerCase();
  return models.filter(
    (model) =>
      !filter ||
      model.provider.toLowerCase().includes(filter) ||
      model.id.toLowerCase().includes(filter) ||
      model.name.toLowerCase().includes(filter),
  );
}
