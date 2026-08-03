// Derives the provider rows for the login modal, grouping OpenAI methods.

import type {
  ProviderAuthCatalog,
  ProviderAuthCatalogEntry,
} from "@uix/api/agent-channels";

interface ProviderAuthRow {
  id: string;
  name: string;
  methods: ProviderAuthCatalogEntry["methods"];
}

/** Derive Chat rows without changing the backend identity on each method. */
export function deriveProviderAuthRows(
  catalog: ProviderAuthCatalog | undefined,
): ProviderAuthRow[] | undefined {
  if (!catalog) return undefined;
  const openAI = catalog.find((provider) => provider.id === "openai");
  const codex = catalog.find((provider) => provider.id === "openai-codex");
  if (!openAI || !codex) return [...catalog];

  const groupIndex = Math.min(catalog.indexOf(openAI), catalog.indexOf(codex));
  return catalog.flatMap((provider, index) => {
    if (index === groupIndex) {
      return [{ ...openAI, methods: [...openAI.methods, ...codex.methods] }];
    }
    return provider === openAI || provider === codex ? [] : [provider];
  });
}
