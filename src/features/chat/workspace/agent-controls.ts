// Owns chat agent state: model picker, provider auth flow, and status over the agent channels.

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  agentChannels,
  AgentStatus,
  ModelCatalog,
  ModelCatalogEntry,
  ProviderAuthCatalog,
  ProviderAuthFlowSnapshot,
  ProviderAuthType,
} from "@uix/api/agent-channels";
import { type ChannelClient, useWorkspaceSession } from "@uix/api/workspace";

import { getInitialModelScope, type ModelPickerScope } from "./model-filter";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

interface ModelPickerState {
  scope: ModelPickerScope;
  initialQuery: string;
}

function isProviderAuthFlowRunning(flow: ProviderAuthFlowSnapshot): boolean {
  return flow.phase.type === "starting" || flow.phase.type === "active";
}

export function useAgentControls(client: AgentChannelClient): {
  status: AgentStatus | undefined;
  models: ModelCatalog | undefined;
  modelError: string | undefined;
  modelPicker: ModelPickerState | undefined;
  toggleModelPicker: () => void;
  openModelPicker: (scope: ModelPickerScope) => void;
  closeModelPicker: () => void;
  setModelPickerScope: (scope: ModelPickerScope) => void;
  selectModel: (model: ModelCatalogEntry) => Promise<void>;
  setModelFavorite: (
    model: ModelCatalogEntry,
    favorite: boolean,
  ) => Promise<void>;
  providerModalOpen: boolean;
  providers: ProviderAuthCatalog | undefined;
  providerError: string | undefined;
  openProviderModal: (invoker: HTMLElement) => void;
  closeProviderModal: () => void;
  providerAuthFlow: ProviderAuthFlowSnapshot | undefined;
  providerAuthError: string | undefined;
  selectProviderAuthMethod: (
    providerId: string,
    authType: ProviderAuthType,
  ) => Promise<void>;
  answerProviderAuthPrompt: (
    flowId: string,
    promptId: string,
    value: string,
  ) => Promise<void>;
  openProviderAuthLink: (flowId: string, linkId: string) => Promise<void>;
  cancelProviderAuthFlow: () => Promise<void>;
  chooseModelForProvider: (providerId: string) => void;
} {
  const { sessionSelectionVersion } = useWorkspaceSession();
  const [status, setStatus] = useState<AgentStatus>();
  const [models, setModels] = useState<ModelCatalog>();
  const [modelError, setModelError] = useState<string>();
  const [modelPicker, setModelPicker] = useState<ModelPickerState>();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderAuthCatalog>();
  const [providerError, setProviderError] = useState<string>();
  const [providerAuthFlow, setProviderAuthFlow] =
    useState<ProviderAuthFlowSnapshot>();
  const [providerAuthError, setProviderAuthError] = useState<string>();
  const modelRequestVersion = useRef(0);
  const sessionSelectionVersionRef = useRef(sessionSelectionVersion);
  sessionSelectionVersionRef.current = sessionSelectionVersion;
  const providerRequestVersion = useRef(0);
  const providerAuthEventVersion = useRef(0);
  const providerAuthFlowRef = useRef<ProviderAuthFlowSnapshot>();
  const providerAuthBeginRequest = useRef<Promise<ProviderAuthFlowSnapshot>>();
  const providerAuthCancelRequest = useRef<{
    flowId: string;
    request: Promise<boolean>;
  }>();
  const providerAuthSelectionVersion = useRef(0);
  const modalInvoker = useRef<HTMLElement>();

  const commitProviderAuthFlow = useCallback(
    (flow: ProviderAuthFlowSnapshot | undefined) => {
      providerAuthFlowRef.current = flow;
      setProviderAuthFlow(flow);
    },
    [],
  );

  useEffect(
    () => () => {
      modelRequestVersion.current += 1;
      providerRequestVersion.current += 1;
      providerAuthEventVersion.current += 1;
      providerAuthSelectionVersion.current += 1;
    },
    [client],
  );

  // Subscribe before seeding so the client does not miss a status_changed
  // that lands during the request. Session changes clear the old status and
  // seed from the newly accepted attachment target.
  useEffect(() => client.events.status_changed(setStatus), [client]);
  useEffect(() => {
    let cancelled = false;
    setStatus(undefined);
    void client.requests
      .agent_status(undefined)
      .then((seed) => {
        if (!cancelled) setStatus((previous) => previous ?? seed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, sessionSelectionVersion]);

  const refreshModels = useCallback(async () => {
    const version = ++modelRequestVersion.current;
    setModelError(undefined);
    try {
      const list = await client.requests.list_models(undefined);
      if (version === modelRequestVersion.current) {
        setModels(list.models);
      }
    } catch (error) {
      if (version === modelRequestVersion.current) {
        setModelError(String(error));
      }
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
    async (model: ModelCatalogEntry) => {
      const acceptedSessionSelectionVersion = sessionSelectionVersion;
      const nextStatus = await client.requests.select_model({
        provider: model.provider,
        id: model.id,
      });
      if (
        sessionSelectionVersionRef.current !== acceptedSessionSelectionVersion
      ) {
        return;
      }
      setStatus(nextStatus);
      setModelPicker(undefined);
    },
    [client, sessionSelectionVersion],
  );

  const setModelFavorite = useCallback(
    async (model: ModelCatalogEntry, favorite: boolean) => {
      const version = ++modelRequestVersion.current;
      const list = await client.requests.set_model_favorite({
        provider: model.provider,
        id: model.id,
        favorite,
      });
      if (version === modelRequestVersion.current) {
        setModels(list.models);
      }
    },
    [client],
  );

  const refreshProviders = useCallback(async () => {
    const version = ++providerRequestVersion.current;
    setProviderError(undefined);
    try {
      const list = await client.requests.list_auth_providers(undefined);
      if (version === providerRequestVersion.current) {
        setProviders(list.providers);
      }
    } catch (error) {
      if (version === providerRequestVersion.current) {
        setProviderError(String(error));
      }
    }
  }, [client]);

  useEffect(
    () =>
      client.events.provider_auth_flow_changed((flow) => {
        providerAuthEventVersion.current += 1;
        commitProviderAuthFlow(flow);
        setProviderAuthError(undefined);
        if (flow.phase.type === "success") void refreshProviders();
      }),
    [client, commitProviderAuthFlow, refreshProviders],
  );

  const openProviderModal = useCallback(
    (invoker: HTMLElement) => {
      modalInvoker.current = invoker;
      setModelPicker(undefined);
      setProviderModalOpen(true);
      setProviders(undefined);
      setProviderAuthError(undefined);
      void refreshProviders();

      // Subscribe for the component lifetime (above) before seeding. A flow
      // event that lands during this request wins over the older snapshot.
      const eventVersion = providerAuthEventVersion.current;
      void client.requests
        .current_provider_auth_flow(undefined)
        .then((flow) => {
          if (providerAuthEventVersion.current !== eventVersion) return;
          commitProviderAuthFlow(flow ?? undefined);
        })
        .catch((error: unknown) => {
          setProviderAuthError(String(error));
        });
    },
    [client, commitProviderAuthFlow, refreshProviders],
  );

  const closeProviderModal = useCallback(() => {
    setProviderModalOpen(false);
    requestAnimationFrame(() => modalInvoker.current?.focus());
  }, []);

  const beginProviderAuthFlow = useCallback(
    async (
      providerId: string,
      authType: ProviderAuthType,
    ): Promise<ProviderAuthFlowSnapshot | undefined> => {
      setProviderAuthError(undefined);
      const eventVersion = providerAuthEventVersion.current;
      const request = client.requests.begin_provider_auth_flow({
        providerId,
        authType,
      });
      providerAuthBeginRequest.current = request;
      try {
        const flow = await request;
        if (providerAuthEventVersion.current === eventVersion) {
          commitProviderAuthFlow(flow);
        }
        return flow;
      } catch (error) {
        setProviderAuthError(String(error));
        return undefined;
      } finally {
        if (providerAuthBeginRequest.current === request) {
          providerAuthBeginRequest.current = undefined;
        }
      }
    },
    [client, commitProviderAuthFlow],
  );

  const cancelProviderAuthFlowById = useCallback(
    (flowId: string): Promise<boolean> => {
      const current = providerAuthCancelRequest.current;
      if (current?.flowId === flowId) return current.request;

      setProviderAuthError(undefined);
      const request = client.requests
        .cancel_provider_auth_flow({ flowId })
        .then(() => true)
        .catch((error: unknown) => {
          setProviderAuthError(String(error));
          return false;
        })
        .finally(() => {
          if (providerAuthCancelRequest.current?.request === request) {
            providerAuthCancelRequest.current = undefined;
          }
        });
      providerAuthCancelRequest.current = { flowId, request };
      return request;
    },
    [client],
  );

  const selectProviderAuthMethod = useCallback(
    async (providerId: string, authType: ProviderAuthType) => {
      const selectionVersion = ++providerAuthSelectionVersion.current;
      let currentFlow = providerAuthFlowRef.current;
      const pendingBegin = providerAuthBeginRequest.current;
      if (!currentFlow && pendingBegin) {
        try {
          currentFlow = await pendingBegin;
        } catch {
          return;
        }
      }

      if (currentFlow && isProviderAuthFlowRunning(currentFlow)) {
        const isCurrentMethod =
          currentFlow.providerId === providerId &&
          currentFlow.authType === authType;
        const didCancel = await cancelProviderAuthFlowById(currentFlow.flowId);
        if (
          !didCancel ||
          selectionVersion !== providerAuthSelectionVersion.current
        ) {
          return;
        }
        if (isCurrentMethod) {
          commitProviderAuthFlow(undefined);
          return;
        }
      }

      if (selectionVersion === providerAuthSelectionVersion.current) {
        await beginProviderAuthFlow(providerId, authType);
      }
    },
    [beginProviderAuthFlow, cancelProviderAuthFlowById, commitProviderAuthFlow],
  );

  const answerProviderAuthPrompt = useCallback(
    async (flowId: string, promptId: string, value: string) => {
      setProviderAuthError(undefined);
      try {
        await client.requests.answer_provider_auth_flow({
          flowId,
          promptId,
          value,
        });
      } catch (error) {
        setProviderAuthError(String(error));
        throw error;
      }
    },
    [client],
  );

  const openProviderAuthLink = useCallback(
    async (flowId: string, linkId: string) => {
      setProviderAuthError(undefined);
      try {
        await client.requests.open_provider_auth_link({ flowId, linkId });
      } catch (error) {
        setProviderAuthError(String(error));
      }
    },
    [client],
  );

  const cancelProviderAuthFlow = useCallback(async () => {
    providerAuthSelectionVersion.current += 1;
    let flow = providerAuthFlowRef.current;
    const pendingBegin = providerAuthBeginRequest.current;
    if (!flow && pendingBegin) {
      try {
        flow = await pendingBegin;
      } catch {
        return;
      }
    }
    if (flow && isProviderAuthFlowRunning(flow)) {
      await cancelProviderAuthFlowById(flow.flowId);
    }
  }, [cancelProviderAuthFlowById]);

  const chooseModelForProvider = useCallback((providerId: string) => {
    // This is an explicit handoff from the modal's success action, so do not
    // restore focus to its invoker. The picker will focus its search input.
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
    providerAuthFlow,
    providerAuthError,
    selectProviderAuthMethod,
    answerProviderAuthPrompt,
    openProviderAuthLink,
    cancelProviderAuthFlow,
    chooseModelForProvider,
  };
}

export type AgentControls = ReturnType<typeof useAgentControls>;
