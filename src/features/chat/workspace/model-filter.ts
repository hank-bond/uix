// Picker filtering, extracted pure so it's testable without a DOM.

import type { ModelOption } from "@uix/api/agent-channels";

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
