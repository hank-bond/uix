import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  ProviderAuthFlowSnapshot,
  ProviderAuthMethod,
} from "@uix/api/agent-channels";

import type { AgentControls } from "./agent-controls";
import { ProviderAuthFlowPanel } from "./ProviderAuthFlowPanel";

const method: ProviderAuthMethod = {
  providerId: "openai-codex",
  authType: "oauth",
};

const controls: AgentControls = {
  status: undefined,
  models: undefined,
  modelError: undefined,
  modelPicker: undefined,
  toggleModelPicker: vi.fn(),
  openModelPicker: vi.fn(),
  closeModelPicker: vi.fn(),
  setModelPickerScope: vi.fn(),
  selectModel: vi.fn(() => Promise.resolve()),
  setModelFavorite: vi.fn(() => Promise.resolve()),
  providerModalOpen: true,
  providers: undefined,
  providerError: undefined,
  openProviderModal: vi.fn(),
  closeProviderModal: vi.fn(),
  providerAuthFlow: undefined,
  providerAuthError: undefined,
  selectProviderAuthMethod: vi.fn(() => Promise.resolve()),
  answerProviderAuthPrompt: vi.fn(() => Promise.resolve()),
  cancelProviderAuthFlow: vi.fn(() => Promise.resolve()),
  chooseModelForProvider: vi.fn(),
};

describe("ProviderAuthFlowPanel", () => {
  it("renders retained authorization and device-code links for the browser device", () => {
    const flow: ProviderAuthFlowSnapshot = {
      flowId: "flow-1",
      providerId: "openai-codex",
      authType: "oauth",
      phase: { type: "active" },
      notices: [
        {
          type: "authorization",
          link: {
            linkId: "link-1",
            url: "https://provider.example/authorize",
          },
        },
        {
          type: "device_code",
          link: {
            linkId: "link-2",
            url: "https://provider.example/device",
          },
          userCode: "ABCD-EFGH",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ProviderAuthFlowPanel
        id="provider-auth-flow"
        providerName="OpenAI"
        method={method}
        flow={flow}
        controls={controls}
      />,
    );

    expect(html).toContain('href="https://provider.example/authorize"');
    expect(html).toContain('href="https://provider.example/device"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("ABCD-EFGH");
  });
});
