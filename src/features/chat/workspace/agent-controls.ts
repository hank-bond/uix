import { useCallback, useEffect, useRef, useState } from "react";

import type {
  agentChannels,
  AgentStatus,
  ModelOption,
  OAuthProviderOption,
} from "@uix/api/agent-channels";
import type { ChannelClient } from "@uix/api/workspace";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

export function useAgentControls(client: AgentChannelClient) {
  const [status, setStatus] = useState<AgentStatus>();
  const [models, setModels] = useState<ModelOption[]>();
  const [modelError, setModelError] = useState<string>();
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providers, setProviders] = useState<OAuthProviderOption[]>();
  const [providerError, setProviderError] = useState<string>();
  const modalInvoker = useRef<HTMLElement>();

  // Subscribe before seeding so a status_changed that lands during the
  // request cannot be lost.
  useEffect(() => client.events.status_changed(setStatus), [client]);
  useEffect(() => {
    let cancelled = false;
    void client.requests
      .agent_status(undefined)
      .then((seed) => {
        if (!cancelled) setStatus((previous) => previous ?? seed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  const refreshModels = useCallback(() => {
    setModelError(undefined);
    void client.requests
      .list_models(undefined)
      .then((list) => setModels(list.models))
      .catch((error: unknown) => setModelError(String(error)));
  }, [client]);

  useEffect(refreshModels, [refreshModels]);

  const selectModel = useCallback(
    async (model: ModelOption) => {
      const nextStatus = await client.requests.select_model({
        provider: model.provider,
        id: model.id,
      });
      setStatus(nextStatus);
      setModelPickerOpen(false);
    },
    [client],
  );

  const openProviderModal = useCallback(
    (invoker: HTMLElement) => {
      modalInvoker.current = invoker;
      setModelPickerOpen(false);
      setProviderModalOpen(true);
      setProviders(undefined);
      setProviderError(undefined);
      void client.requests
        .list_oauth_providers(undefined)
        .then((list) => setProviders(list.providers))
        .catch((error: unknown) => setProviderError(String(error)));
    },
    [client],
  );

  const closeProviderModal = useCallback(() => {
    setProviderModalOpen(false);
    requestAnimationFrame(() => modalInvoker.current?.focus());
  }, []);

  return {
    status,
    models,
    modelError,
    modelPickerOpen,
    setModelPickerOpen,
    selectModel,
    providerModalOpen,
    providers,
    providerError,
    openProviderModal,
    closeProviderModal,
    refreshModels,
  };
}

export type AgentControls = ReturnType<typeof useAgentControls>;
