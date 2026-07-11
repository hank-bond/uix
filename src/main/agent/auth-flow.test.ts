import { describe, expect, it, vi } from "vitest";

import type { OAuthFlowState } from "@uix/api/agent-channels";

import { createOAuthFlowCoordinator } from "./auth-flow";

type LoginCallbacks = Parameters<
  Parameters<typeof createHarness>[0]["login"]
>[0];

function createHarness(options: {
  login: (callbacks: {
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
  }) => Promise<void>;
  usesCallbackServer?: boolean;
}) {
  const states: OAuthFlowState[] = [];
  const opened: string[] = [];
  const refresh = vi.fn();
  const availabilityChanged = vi.fn();
  const authStorage = {
    getOAuthProviders: () => [
      {
        id: "fake",
        name: "Fake Provider",
        usesCallbackServer: options.usesCallbackServer ?? true,
      },
    ],
    login: (_providerId: string, callbacks: LoginCallbacks) =>
      options.login(callbacks),
  };
  const coordinator = createOAuthFlowCoordinator({
    modelRegistry: () => Promise.resolve({ authStorage, refresh }),
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    onState: (state) => states.push(state),
    onAvailabilityChange: availabilityChanged,
  });
  return {
    coordinator,
    states,
    opened,
    refresh,
    availabilityChanged,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("OAuth flow coordinator", () => {
  it("drives Pi's generic callback vocabulary through one correlated flow", async () => {
    const answers: string[] = [];
    const harness = createHarness({
      login: async (callbacks) => {
        callbacks.onAuth({
          url: "https://provider.example/authorize",
          instructions: "Authorize in your browser",
        });
        callbacks.onDeviceCode({
          verificationUri: "https://provider.example/device",
          userCode: "ABCD-EFGH",
          intervalSeconds: 5,
        });
        callbacks.onProgress?.("Waiting");
        answers.push(
          await callbacks.onPrompt({
            message: "Account name",
            placeholder: "name",
          }),
        );
        answers.push(
          (await callbacks.onSelect({
            message: "Choose account",
            options: [{ id: "work", label: "Work" }],
          })) ?? "",
        );
        answers.push((await callbacks.onManualCodeInput?.()) ?? "");
      },
    });

    const { flowId } = await harness.coordinator.begin("fake");
    expect(harness.states.map((state) => state.type)).toEqual([
      "authorization",
      "device_code",
      "progress",
      "prompt",
    ]);
    expect(harness.opened).toEqual(["https://provider.example/authorize"]);

    const prompt = harness.coordinator.current();
    expect(prompt?.type).toBe("prompt");
    harness.coordinator.answer(
      flowId,
      (prompt as Extract<OAuthFlowState, { type: "prompt" }>).promptId,
      "Ada",
    );
    await settle();

    const select = harness.coordinator.current();
    expect(select?.type).toBe("select");
    harness.coordinator.answer(
      flowId,
      (select as Extract<OAuthFlowState, { type: "select" }>).promptId,
      "work",
    );
    await settle();

    const manual = harness.coordinator.current();
    expect(manual?.type).toBe("prompt");
    harness.coordinator.answer(
      flowId,
      (manual as Extract<OAuthFlowState, { type: "prompt" }>).promptId,
      "callback-code",
    );
    await settle();

    expect(answers).toEqual(["Ada", "work", "callback-code"]);
    expect(harness.states.at(-1)).toEqual({
      type: "success",
      flowId,
      providerId: "fake",
    });
    expect(harness.refresh).toHaveBeenCalledOnce();
    expect(harness.availabilityChanged).toHaveBeenCalledOnce();
  });

  it("reopens only the active provider-supplied URL", async () => {
    const harness = createHarness({
      login: async (callbacks) => {
        callbacks.onAuth({ url: "https://provider.example/authorize" });
        await new Promise<void>((resolve) =>
          callbacks.signal?.addEventListener("abort", () => resolve()),
        );
      },
    });
    const { flowId } = await harness.coordinator.begin("fake");

    await harness.coordinator.reopen(flowId);

    expect(harness.opened).toEqual([
      "https://provider.example/authorize",
      "https://provider.example/authorize",
    ]);
  });

  it("rejects stale answers and prevents concurrent flows", async () => {
    const harness = createHarness({
      login: async (callbacks) => {
        await callbacks.onPrompt({ message: "Code" });
      },
    });
    const { flowId } = await harness.coordinator.begin("fake");

    await expect(harness.coordinator.begin("fake")).rejects.toThrow(
      "already active",
    );
    expect(() =>
      harness.coordinator.answer(flowId, "stale-prompt", "secret"),
    ).toThrow("not pending");
    expect(() =>
      harness.coordinator.answer("stale-flow", "prompt-1", "secret"),
    ).toThrow("not active");
  });

  it("aborts and rejects pending callbacks on cancellation and disposal", async () => {
    let signal: AbortSignal | undefined;
    let promptRejected = false;
    const harness = createHarness({
      login: async (callbacks) => {
        signal = callbacks.signal;
        try {
          await callbacks.onPrompt({ message: "Code" });
        } catch {
          promptRejected = true;
          throw new Error("cancelled by test provider");
        }
      },
    });
    const { flowId } = await harness.coordinator.begin("fake");

    harness.coordinator.cancel(flowId);
    await settle();

    expect(signal?.aborted).toBe(true);
    expect(promptRejected).toBe(true);
    expect(harness.states.at(-1)).toEqual({ type: "cancelled", flowId });

    const second = createHarness({
      login: async (callbacks) => {
        signal = callbacks.signal;
        await callbacks.onPrompt({ message: "Code" });
      },
    });
    await second.coordinator.begin("fake");
    second.coordinator[Symbol.dispose]();
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(second.states.some((state) => state.type === "failure")).toBe(false);
  });

  it("publishes failures without refreshing model availability", async () => {
    const harness = createHarness({
      login: () => Promise.reject(new Error("provider unavailable")),
    });
    const { flowId } = await harness.coordinator.begin("fake");
    await settle();

    expect(harness.states).toContainEqual({
      type: "failure",
      flowId,
      message: "provider unavailable",
    });
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.availabilityChanged).not.toHaveBeenCalled();
  });
});
