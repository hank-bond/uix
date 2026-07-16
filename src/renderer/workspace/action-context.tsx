import { createContext, useCallback, useContext, type ReactNode } from "react";

import { WorkspaceActionsProvider } from "@uix/api/workspace";

import { ActionRegistry } from "./action-registry";

const ActionRegistryContext = createContext<ActionRegistry | undefined>(
  undefined,
);

export function ActionRegistryProvider({
  registry,
  children,
}: {
  registry: ActionRegistry;
  children: ReactNode;
}) {
  const getCatalogSnapshot = useCallback(
    () => registry.getCatalogSnapshot(),
    [registry],
  );
  const subscribeToCatalog = useCallback(
    (listener: () => void) => registry.subscribeToCatalog(listener),
    [registry],
  );
  const invoke = useCallback((id: string) => registry.invoke(id), [registry]);

  return (
    <ActionRegistryContext.Provider value={registry}>
      <WorkspaceActionsProvider
        getCatalogSnapshot={getCatalogSnapshot}
        subscribeToCatalog={subscribeToCatalog}
        invoke={invoke}
      >
        {children}
      </WorkspaceActionsProvider>
    </ActionRegistryContext.Provider>
  );
}

export function useActionRegistry(): ActionRegistry {
  const registry = useContext(ActionRegistryContext);
  if (!registry) throw new Error("ActionRegistryProvider is missing");
  return registry;
}
