// chat surface contribution.

import { Chat } from "./Chat";
import { agentChannels } from "@uix/api/agent-channels";
import { defineSurface } from "@uix/api/workspace";

import chatSheet from "./Chat.css" with { type: "css" };
import chatBlockSheet from "./blocks/ChatBlock.css" with { type: "css" };
import pickerPositioningSheet from "./picker-positioning.css" with { type: "css" };
import sessionPillSheet from "./SessionPill.css" with { type: "css" };
import modelPillSheet from "./ModelPill.css" with { type: "css" };
import providerControlsSheet from "./provider-controls.css" with { type: "css" };
import providerLoginModalSheet from "./ProviderLoginModal.css" with { type: "css" };
import oauthFlowPanelSheet from "./OAuthFlowPanel.css" with { type: "css" };

export default defineSurface({
  name: "chat",
  contract: agentChannels,
  styles: [
    chatSheet,
    chatBlockSheet,
    pickerPositioningSheet,
    sessionPillSheet,
    modelPillSheet,
    providerControlsSheet,
    providerLoginModalSheet,
    oauthFlowPanelSheet,
  ],
  render: (client) => <Chat client={client} />,
});
