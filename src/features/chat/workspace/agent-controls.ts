import { useCallback, useEffect, useRef, useState } from "react";

import type {
  agentChannels,
  AgentStatus,
  AuthProvider,
  ModelOption,
  OAuthFlowState,
} from "@uix/api/agent-channels";
import type { ChannelClient } from "@uix/api/workspace";
import { getInitialModelScope, type ModelPickerScope } from "./model-filter";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

interface ModelPickerState {
  scope: ModelPickerScope;
  initialQuery: string;
}

interface OAuthActivity {
  providerId: string;
  actionId: string;
  flowId?: string;
  flow?: OAuthFlowState;
}

export function useAgentControls(client: AgentChannelClient) {
  const [status, setStatus] = useState<AgentStatus>();
  const [models, setModels] = useState<ModelOption[]>();
  const [modelError, setModelError] = useState<string>();
  const [modelPicker, setModelPicker] = useState<ModelPickerState>();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providers, setProviders] = useState<AuthProvider[]>();
  const [providerError, setProviderError] = useState<string>();
  const [oauthActivity, setOAuthActivity] = useState<OAuthActivity>();
  const [oauthError, setOAuthError] = useState<string>();
  const oauthEventVersion = useRef(0);
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

  const refreshModels = useCallback(async () => {
    setModelError(undefined);
    try {
      const list = await client.requests.list_models(undefined);
      setModels(list.models);
    } catch (error) {
      setModelError(String(error));
    }
  }, [client]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);
  useEffect(
    () =>
      client.events.model_availability_changed(() => {
        void refreshModels();
      }),
    [client, refreshModels],
  );

  const toggleModelPicker = useCallback(() => {
    setModelPicker((current) =>
      current
        ? undefined
        : {
            scope: getInitialModelScope(models ?? [], ""),
            initialQuery: "",
          },
    );
  }, [models]);

  const openModelPicker = useCallback((scope: ModelPickerScope) => {
    setModelPicker({ scope, initialQuery: "" });
  }, []);

  const closeModelPicker = useCallback(() => {
    setModelPicker(undefined);
  }, []);

  const setModelPickerScope = useCallback((scope: ModelPickerScope) => {
    setModelPicker((current) => (current ? { ...current, scope } : undefined));
  }, []);

  const selectModel = useCallback(
    async (model: ModelOption) => {
      const nextStatus = await client.requests.select_model({
        provider: model.provider,
        id: model.id,
      });
      setStatus(nextStatus);
      setModelPicker(undefined);
    },
    [client],
  );

  const setModelFavorite = useCallback(
    async (model: ModelOption, favorite: boolean) => {
      const list = await client.requests.set_model_favorite({
        provider: model.provider,
        id: model.id,
        favorite,
      });
      setModels(list.models);
    },
    [client],
  );

  const refreshProviders = useCallback(async () => {
    setProviderError(undefined);
    try {
      const list = await client.requests.list_auth_providers(undefined);
      setProviders(list.providers);
    } catch (error) {
      setProviderError(String(error));
    }
  }, [client]);

  useEffect(
    () =>
      client.events.oauth_flow_changed((flow) => {
        oauthEventVersion.current += 1;
        setOAuthActivity({
          providerId: flow.providerId,
          actionId: flow.actionId,
          flowId: flow.flowId,
          flow,
        });
        setOAuthError(undefined);
        if (flow.type === "success") {
          void Promise.all([refreshProviders(), refreshModels()]);
        }
      }),
    [client, refreshModels, refreshProviders],
  );

  const openProviderModal = useCallback(
    (invoker: HTMLElement) => {
      modalInvoker.current = invoker;
      setModelPicker(undefined);
      setProviderModalOpen(true);
      setProviders(undefined);
      setOAuthActivity(undefined);
      setOAuthError(undefined);
      void refreshProviders();

      // Subscribe for the component lifetime (above) before seeding. A flow
      // event that lands during this request wins over the older snapshot.
      const eventVersion = oauthEventVersion.current;
      void client.requests
        .current_oauth_flow(undefined)
        .then((flow) => {
          if (oauthEventVersion.current !== eventVersion || !flow) return;
          setOAuthActivity({
            providerId: flow.providerId,
            actionId: flow.actionId,
            flowId: flow.flowId,
            flow,
          });
        })
        .catch((error: unknown) => setOAuthError(String(error)));
    },
    [client, refreshProviders],
  );

  const closeProviderModal = useCallback(() => {
    setProviderModalOpen(false);
    requestAnimationFrame(() => modalInvoker.current?.focus());
  }, []);

  const saveProviderCredentials = useCallback(
    async (credentials: {
      providerId: string;
      methodId: string;
      values: Record<string, string>;
    }) => {
      await client.requests.save_provider_credentials(credentials);
      await Promise.all([refreshProviders(), refreshModels()]);
    },
    [client, refreshModels, refreshProviders],
  );

  const beginOAuthFlow = useCallback(
    async (providerId: string, actionId: string) => {
      setOAuthError(undefined);
      setOAuthActivity({ providerId, actionId });
      try {
        const { flowId } = await client.requests.begin_oauth_flow({
          providerId,
          actionId,
        });
        setOAuthActivity((current) =>
          current?.providerId === providerId && current.actionId === actionId
            ? { ...current, flowId }
            : current,
        );
      } catch (error) {
        setOAuthActivity(undefined);
        setOAuthError(String(error));
      }
    },
    [client],
  );

  const answerOAuthFlow = useCallback(
    async (flowId: string, promptId: string, value: string) => {
      setOAuthError(undefined);
      try {
        await client.requests.answer_oauth_flow({ flowId, promptId, value });
      } catch (error) {
        setOAuthError(String(error));
        throw error;
      }
    },
    [client],
  );

  const reopenOAuthFlow = useCallback(
    async (flowId: string) => {
      setOAuthError(undefined);
      try {
        await client.requests.reopen_oauth_flow({ flowId });
      } catch (error) {
        setOAuthError(String(error));
      }
    },
    [client],
  );

  const cancelOAuthFlow = useCallback(async () => {
    const flowId = oauthActivity?.flowId;
    if (!flowId) return;
    setOAuthError(undefined);
    try {
      await client.requests.cancel_oauth_flow({ flowId });
    } catch (error) {
      setOAuthError(String(error));
    }
  }, [client, oauthActivity?.flowId]);

  const dismissOAuthFlow = useCallback(() => {
    setOAuthActivity(undefined);
    setOAuthError(undefined);
  }, []);

  const chooseModelForProvider = useCallback((providerId: string) => {
    // This is an explicit handoff from the modal's success action, so do not
    // restore focus to its invoker; the picker will focus its search input.
    setProviderModalOpen(false);
    setModelPicker({ scope: "all", initialQuery: providerId });
  }, []);

  return {
    status,
    models,
    modelError,
    modelPicker,
    toggleModelPicker,
    openModelPicker,
    closeModelPicker,
    setModelPickerScope,
    selectModel,
    setModelFavorite,
    providerModalOpen,
    providers,
    providerError,
    openProviderModal,
    closeProviderModal,
    saveProviderCredentials,
    oauthActivity,
    oauthError,
    beginOAuthFlow,
    answerOAuthFlow,
    reopenOAuthFlow,
    cancelOAuthFlow,
    dismissOAuthFlow,
    chooseModelForProvider,
  };
}

export type AgentControls = ReturnType<typeof useAgentControls>;
