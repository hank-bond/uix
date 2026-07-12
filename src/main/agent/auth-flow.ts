import type { OAuthFlowState } from "@uix/api/agent-channels";

type OAuthFlowStateInput = OAuthFlowState extends infer State
  ? State extends OAuthFlowState
    ? Omit<State, "providerId" | "actionId">
    : never
  : never;

interface OAuthCallbacks {
  onAuth(info: { url: string; instructions?: string }): void;
  onDeviceCode(info: {
    userCode: string;
    verificationUri: string;
    intervalSeconds?: number;
    expiresInSeconds?: number;
  }): void;
  onPrompt(prompt: {
    message: string;
    placeholder?: string;
    allowEmpty?: boolean;
  }): Promise<string>;
  onProgress?(message: string): void;
  onManualCodeInput?(): Promise<string>;
  onSelect(prompt: {
    message: string;
    options: Array<{ id: string; label: string }>;
  }): Promise<string | undefined>;
  signal?: AbortSignal;
}

interface AuthService {
  getOAuthProviders(): Array<{
    id: string;
    name: string;
    usesCallbackServer?: boolean;
  }>;
  login(providerId: string, callbacks: OAuthCallbacks): Promise<void>;
}

interface ModelService {
  authStorage: AuthService;
  refresh(): void;
}

interface PendingAnswer {
  id: string;
  allowEmpty: boolean;
  resolve(value: string): void;
  reject(error: Error): void;
}

interface ActiveFlow {
  id: string;
  providerId: string;
  actionId: string;
  usesCallbackServer: boolean;
  abort: AbortController;
  currentUrl?: string;
  state?: OAuthFlowState;
  pending?: PendingAnswer;
  initialSelection?: string;
}

interface CreateOAuthFlowCoordinatorOptions {
  modelRegistry: () => Promise<ModelService>;
  openExternal: (url: string) => void | Promise<void>;
  onState: (state: OAuthFlowState) => void;
  onAvailabilityChange: () => void;
}

export interface OAuthFlowCoordinator extends Disposable {
  begin(
    providerId: string,
    actionId: string,
    initialSelection?: string,
  ): Promise<{ flowId: string }>;
  answer(flowId: string, promptId: string, value: string): void;
  reopen(flowId: string): Promise<void>;
  cancel(flowId: string): void;
  current(): OAuthFlowState | undefined;
}

export function createOAuthFlowCoordinator(
  opts: CreateOAuthFlowCoordinatorOptions,
): OAuthFlowCoordinator {
  let active: ActiveFlow | undefined;
  let nextFlowId = 1;
  let nextPromptId = 1;
  let disposed = false;

  function requireFlow(flowId: string): ActiveFlow {
    if (!active || active.id !== flowId) {
      throw new Error(`OAuth flow is not active: ${flowId}`);
    }
    return active;
  }

  function publish(flow: ActiveFlow, input: OAuthFlowStateInput): void {
    if (active !== flow || flow.abort.signal.aborted) return;
    const state = {
      ...input,
      providerId: flow.providerId,
      actionId: flow.actionId,
    };
    flow.state = state;
    opts.onState(state);
  }

  function waitForAnswer(
    flow: ActiveFlow,
    state:
      | Omit<
          Extract<OAuthFlowState, { type: "prompt" }>,
          "providerId" | "actionId" | "promptId"
        >
      | Omit<
          Extract<OAuthFlowState, { type: "select" }>,
          "providerId" | "actionId" | "promptId"
        >,
    allowEmpty: boolean,
  ): Promise<string> {
    flow.pending?.reject(new Error("OAuth prompt was replaced"));
    const promptId = `prompt-${nextPromptId++}`;
    return new Promise((resolve, reject) => {
      flow.pending = { id: promptId, allowEmpty, resolve, reject };
      publish(flow, { ...state, promptId });
    });
  }

  function rejectPending(flow: ActiveFlow, message: string): void {
    flow.pending?.reject(new Error(message));
    flow.pending = undefined;
  }

  function cancelFlow(flow: ActiveFlow, publishCancellation: boolean): void {
    flow.abort.abort();
    rejectPending(flow, "OAuth login cancelled");
    if (active !== flow) return;
    if (publishCancellation) {
      const state = {
        type: "cancelled",
        flowId: flow.id,
        providerId: flow.providerId,
        actionId: flow.actionId,
      } as const;
      flow.state = state;
      opts.onState(state);
    }
    active = undefined;
  }

  async function run(flow: ActiveFlow, registry: ModelService): Promise<void> {
    try {
      await registry.authStorage.login(flow.providerId, {
        onAuth: (info) => {
          flow.currentUrl = info.url;
          publish(flow, {
            type: "authorization",
            flowId: flow.id,
            url: info.url,
            ...(info.instructions && { instructions: info.instructions }),
            supportsManualInput: flow.usesCallbackServer,
          });
          void Promise.resolve(opts.openExternal(info.url)).catch(() => {});
        },
        onDeviceCode: (info) => {
          flow.currentUrl = info.verificationUri;
          publish(flow, {
            type: "device_code",
            flowId: flow.id,
            verificationUrl: info.verificationUri,
            userCode: info.userCode,
            ...(info.intervalSeconds !== undefined && {
              intervalSeconds: info.intervalSeconds,
            }),
            ...(info.expiresInSeconds !== undefined && {
              expiresInSeconds: info.expiresInSeconds,
            }),
          });
          void Promise.resolve(opts.openExternal(info.verificationUri)).catch(
            () => {},
          );
        },
        onPrompt: (prompt) =>
          waitForAnswer(
            flow,
            {
              type: "prompt",
              flowId: flow.id,
              message: prompt.message,
              ...(prompt.placeholder && { placeholder: prompt.placeholder }),
              allowEmpty: prompt.allowEmpty ?? false,
            },
            prompt.allowEmpty ?? false,
          ),
        onProgress: (message) =>
          publish(flow, { type: "progress", flowId: flow.id, message }),
        onManualCodeInput: () =>
          waitForAnswer(
            flow,
            {
              type: "prompt",
              flowId: flow.id,
              message: "Paste the redirect URL or authorization code",
              allowEmpty: false,
            },
            false,
          ),
        onSelect: (prompt) => {
          if (flow.initialSelection !== undefined) {
            const selection = flow.initialSelection;
            flow.initialSelection = undefined;
            if (!prompt.options.some((option) => option.id === selection)) {
              return Promise.reject(
                new Error(`OAuth selection is not offered: ${selection}`),
              );
            }
            return Promise.resolve(selection);
          }
          return waitForAnswer(
            flow,
            {
              type: "select",
              flowId: flow.id,
              message: prompt.message,
              options: prompt.options,
            },
            false,
          );
        },
        signal: flow.abort.signal,
      });
      if (active !== flow || flow.abort.signal.aborted) return;
      rejectPending(flow, "OAuth login completed");
      registry.refresh();
      publish(flow, {
        type: "success",
        flowId: flow.id,
      });
      active = undefined;
      opts.onAvailabilityChange();
    } catch (error) {
      if (active !== flow || flow.abort.signal.aborted) return;
      rejectPending(flow, "OAuth login failed");
      publish(flow, {
        type: "failure",
        flowId: flow.id,
        message: error instanceof Error ? error.message : String(error),
      });
      active = undefined;
    }
  }

  return {
    async begin(providerId, actionId, initialSelection) {
      if (disposed) throw new Error("OAuth coordinator is disposed");
      if (active) throw new Error(`OAuth flow already active: ${active.id}`);
      const registry = await opts.modelRegistry();
      const provider = registry.authStorage
        .getOAuthProviders()
        .find((candidate) => candidate.id === providerId);
      if (!provider) throw new Error(`Unknown OAuth provider: ${providerId}`);
      const flow: ActiveFlow = {
        id: `flow-${nextFlowId++}`,
        providerId,
        actionId,
        usesCallbackServer: provider.usesCallbackServer ?? false,
        abort: new AbortController(),
        ...(initialSelection !== undefined && { initialSelection }),
      };
      active = flow;
      void run(flow, registry);
      return { flowId: flow.id };
    },

    answer(flowId, promptId, value) {
      const flow = requireFlow(flowId);
      const pending = flow.pending;
      if (!pending || pending.id !== promptId) {
        throw new Error(`OAuth prompt is not pending: ${promptId}`);
      }
      if (!pending.allowEmpty && value.length === 0) {
        throw new Error("OAuth prompt requires a value");
      }
      flow.pending = undefined;
      pending.resolve(value);
    },

    async reopen(flowId) {
      const flow = requireFlow(flowId);
      if (!flow.currentUrl) {
        throw new Error(`OAuth flow has no authorization URL: ${flowId}`);
      }
      await opts.openExternal(flow.currentUrl);
    },

    cancel(flowId) {
      cancelFlow(requireFlow(flowId), true);
    },

    current() {
      return active?.state;
    },

    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      if (active) cancelFlow(active, false);
    },
  };
}
