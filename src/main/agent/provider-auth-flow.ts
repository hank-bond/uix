import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
  ProviderAuthFlowSnapshot,
  ProviderAuthLink,
  ProviderAuthNotice,
  ProviderAuthPrompt,
  ProviderAuthType,
} from "@uix/api/agent-channels";

import { onAbort } from "../lifecycle";

type AuthInteraction = Parameters<ModelRuntime["login"]>[2];
type AuthPrompt = Parameters<AuthInteraction["prompt"]>[0];
type AuthEvent = Parameters<AuthInteraction["notify"]>[0];

interface ProviderAuthRuntime {
  getProvider(providerId: string):
    | {
        auth: {
          apiKey?: { login?: unknown };
          oauth?: { login?: unknown };
        };
      }
    | undefined;
  login(
    providerId: string,
    authType: ProviderAuthType,
    interaction: AuthInteraction,
  ): Promise<unknown>;
}

interface PendingProviderAuthPrompt {
  promptId: string;
  resolve(value: string): void;
  reject(error: Error): void;
  abortSubscription?: Disposable;
}

interface ActiveProviderAuthFlow {
  flowId: string;
  providerId: string;
  authType: ProviderAuthType;
  abortController: AbortController;
  snapshot: ProviderAuthFlowSnapshot;
  linksById: Map<string, string>;
  pendingPrompt?: PendingProviderAuthPrompt;
}

interface CreateProviderAuthFlowCoordinatorOptions {
  getModelRuntime: () => Promise<ProviderAuthRuntime>;
  openExternal: (url: string) => void | Promise<void>;
  onSnapshot: (snapshot: ProviderAuthFlowSnapshot) => void;
  onAvailabilityChange: () => void;
}

/** The coordinator's public surface — drives interactive provider auth flows. */
export interface ProviderAuthFlowCoordinator {
  begin(
    providerId: string,
    authType: ProviderAuthType,
  ): ProviderAuthFlowSnapshot;
  answer(flowId: string, promptId: string, value: string): void;
  openLink(flowId: string, linkId: string): Promise<void>;
  cancel(flowId: string): void;
  getCurrentSnapshot(): ProviderAuthFlowSnapshot | undefined;
  [Symbol.dispose](): void;
}

export function createProviderAuthFlowCoordinator(
  opts: CreateProviderAuthFlowCoordinatorOptions,
): ProviderAuthFlowCoordinator {
  let activeFlow: ActiveProviderAuthFlow | undefined;
  let nextFlowId = 1;
  let nextPromptId = 1;
  let nextLinkId = 1;
  let isDisposed = false;

  function isActiveFlow(flow: ActiveProviderAuthFlow): boolean {
    return activeFlow === flow && !flow.abortController.signal.aborted;
  }

  function requireActiveFlow(flowId: string): ActiveProviderAuthFlow {
    if (!activeFlow || activeFlow.flowId !== flowId) {
      throw new Error(`Provider auth flow is not active: ${flowId}`);
    }
    return activeFlow;
  }

  function updateSnapshot(
    flow: ActiveProviderAuthFlow,
    update: (snapshot: ProviderAuthFlowSnapshot) => ProviderAuthFlowSnapshot,
  ): void {
    if (!isActiveFlow(flow)) return;
    flow.snapshot = update(flow.snapshot);
    opts.onSnapshot(flow.snapshot);
  }

  function registerLink(
    flow: ActiveProviderAuthFlow,
    url: string,
    label?: string,
  ): ProviderAuthLink {
    const linkId = `link-${nextLinkId++}`;
    flow.linksById.set(linkId, url);
    return { linkId, url, ...(label && { label }) };
  }

  function appendNotice(
    flow: ActiveProviderAuthFlow,
    notice: ProviderAuthNotice,
  ): void {
    updateSnapshot(flow, (snapshot) => ({
      ...snapshot,
      notices: [...snapshot.notices, notice],
    }));
  }

  function rejectPendingPrompt(
    flow: ActiveProviderAuthFlow,
    message: string,
  ): void {
    const pendingPrompt = flow.pendingPrompt;
    if (!pendingPrompt) return;
    flow.pendingPrompt = undefined;
    pendingPrompt.abortSubscription?.[Symbol.dispose]();
    pendingPrompt.reject(new Error(message));
  }

  function toPromptSnapshot(
    promptId: string,
    prompt: AuthPrompt,
  ): ProviderAuthPrompt {
    if (prompt.type === "select") {
      return {
        type: "select",
        promptId,
        message: prompt.message,
        options: prompt.options.map((option) => ({
          id: option.id,
          label: option.label,
          ...(option.description && { description: option.description }),
        })),
      };
    }
    return {
      type: "input",
      promptId,
      message: prompt.message,
      secret: prompt.type === "secret",
      ...(prompt.placeholder && { placeholder: prompt.placeholder }),
    };
  }

  function requestPromptAnswer(
    flow: ActiveProviderAuthFlow,
    prompt: AuthPrompt,
  ): Promise<string> {
    if (!isActiveFlow(flow)) {
      return Promise.reject(new Error("Provider authentication cancelled"));
    }

    rejectPendingPrompt(flow, "Provider auth prompt was replaced");
    const promptId = `prompt-${nextPromptId++}`;
    return new Promise((resolve, reject) => {
      const pendingPrompt: PendingProviderAuthPrompt = {
        promptId,
        resolve,
        reject,
      };
      flow.pendingPrompt = pendingPrompt;

      if (prompt.signal) {
        pendingPrompt.abortSubscription = onAbort(prompt.signal, () => {
          if (flow.pendingPrompt !== pendingPrompt) return;
          flow.pendingPrompt = undefined;
          updateSnapshot(flow, (snapshot) => ({
            ...snapshot,
            prompt: undefined,
          }));
          reject(new Error("Provider auth prompt was cancelled"));
        });
      }

      if (flow.pendingPrompt !== pendingPrompt) return;
      updateSnapshot(flow, (snapshot) => ({
        ...snapshot,
        phase: { type: "active" },
        prompt: toPromptSnapshot(promptId, prompt),
      }));
    });
  }

  function notifyProviderAuthEvent(
    flow: ActiveProviderAuthFlow,
    event: AuthEvent,
  ): void {
    if (!isActiveFlow(flow)) return;

    if (event.type === "auth_url") {
      const link = registerLink(flow, event.url);
      appendNotice(flow, {
        type: "authorization",
        link,
        ...(event.instructions && { instructions: event.instructions }),
      });
      void Promise.resolve(opts.openExternal(event.url)).catch(() => {});
      return;
    }

    if (event.type === "device_code") {
      const link = registerLink(flow, event.verificationUri);
      appendNotice(flow, {
        type: "device_code",
        link,
        userCode: event.userCode,
        ...(event.intervalSeconds !== undefined && {
          intervalSeconds: event.intervalSeconds,
        }),
        ...(event.expiresInSeconds !== undefined && {
          expiresInSeconds: event.expiresInSeconds,
        }),
      });
      void Promise.resolve(opts.openExternal(event.verificationUri)).catch(
        () => {},
      );
      return;
    }

    if (event.type === "info") {
      appendNotice(flow, {
        type: "info",
        message: event.message,
        links: (event.links ?? []).map((link) =>
          registerLink(flow, link.url, link.label),
        ),
      });
      return;
    }

    appendNotice(flow, { type: "progress", message: event.message });
  }

  function finishFlow(
    flow: ActiveProviderAuthFlow,
    phase: ProviderAuthFlowSnapshot["phase"],
  ): void {
    if (activeFlow !== flow) return;
    rejectPendingPrompt(flow, "Provider authentication ended");
    flow.snapshot = { ...flow.snapshot, phase, prompt: undefined };
    opts.onSnapshot(flow.snapshot);
    activeFlow = undefined;
  }

  async function runProviderAuthFlow(
    flow: ActiveProviderAuthFlow,
  ): Promise<void> {
    try {
      const modelRuntime = await opts.getModelRuntime();
      if (!isActiveFlow(flow)) return;

      const provider = modelRuntime.getProvider(flow.providerId);
      const method =
        flow.authType === "api_key"
          ? provider?.auth.apiKey
          : provider?.auth.oauth;
      if (typeof method?.login !== "function") {
        throw new Error(
          `Provider authentication is not offered: ${flow.providerId}/${flow.authType}`,
        );
      }

      updateSnapshot(flow, (snapshot) => ({
        ...snapshot,
        phase: { type: "active" },
      }));
      await modelRuntime.login(flow.providerId, flow.authType, {
        signal: flow.abortController.signal,
        prompt: (prompt) => requestPromptAnswer(flow, prompt),
        notify: (event) => notifyProviderAuthEvent(flow, event),
      });
      if (!isActiveFlow(flow)) return;

      finishFlow(flow, { type: "success" });
      opts.onAvailabilityChange();
    } catch (error) {
      if (!isActiveFlow(flow)) return;
      finishFlow(flow, {
        type: "failure",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    begin(
      providerId: string,
      authType: ProviderAuthType,
    ): ProviderAuthFlowSnapshot {
      if (isDisposed) throw new Error("Provider auth coordinator is disposed");
      if (activeFlow) {
        throw new Error(
          `Provider auth flow already active: ${activeFlow.flowId}`,
        );
      }

      const flowId = `flow-${nextFlowId++}`;
      const snapshot: ProviderAuthFlowSnapshot = {
        flowId,
        providerId,
        authType,
        phase: { type: "starting" },
        notices: [],
      };
      const flow: ActiveProviderAuthFlow = {
        flowId,
        providerId,
        authType,
        abortController: new AbortController(),
        snapshot,
        linksById: new Map(),
      };
      activeFlow = flow;
      opts.onSnapshot(snapshot);
      void runProviderAuthFlow(flow);
      return snapshot;
    },

    answer(flowId: string, promptId: string, value: string): void {
      const flow = requireActiveFlow(flowId);
      const pendingPrompt = flow.pendingPrompt;
      if (!pendingPrompt || pendingPrompt.promptId !== promptId) {
        throw new Error(`Provider auth prompt is not pending: ${promptId}`);
      }

      flow.pendingPrompt = undefined;
      pendingPrompt.abortSubscription?.[Symbol.dispose]();
      updateSnapshot(flow, (snapshot) => ({
        ...snapshot,
        prompt: undefined,
      }));
      pendingPrompt.resolve(value);
    },

    async openLink(flowId: string, linkId: string): Promise<void> {
      const flow = requireActiveFlow(flowId);
      const url = flow.linksById.get(linkId);
      if (!url) {
        throw new Error(`Provider auth link is not active: ${linkId}`);
      }
      await opts.openExternal(url);
    },

    cancel(flowId: string): void {
      const flow = requireActiveFlow(flowId);
      flow.abortController.abort();
      finishFlow(flow, { type: "cancelled" });
    },

    getCurrentSnapshot(): ProviderAuthFlowSnapshot | undefined {
      return activeFlow?.snapshot;
    },

    [Symbol.dispose](): void {
      if (isDisposed) return;
      isDisposed = true;
      if (!activeFlow) return;
      const flow = activeFlow;
      flow.abortController.abort();
      rejectPendingPrompt(flow, "Provider authentication disposed");
      activeFlow = undefined;
    },
  };
}
