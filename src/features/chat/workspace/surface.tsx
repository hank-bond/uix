import { agentChannels } from "@uix/api/agent-channels";
import { defineSurface } from "@uix/api/workspace";

import { Chat } from "./Chat";
import chatSheet from "./Chat.css" with { type: "css" };
import chatBlockFrameSheet from "./blocks/ChatBlockFrame.css" with { type: "css" };
import messageChatBlockSheet from "./blocks/MessageChatBlock.css" with { type: "css" };
import codeBlockSheet from "./blocks/content/CodeBlock.css" with { type: "css" };
import highlightedCodeSheet from "./blocks/content/HighlightedCode.css" with { type: "css" };
import markdownContentSheet from "./blocks/content/MarkdownContent.css" with { type: "css" };
import toolContentSheet from "./blocks/tool/tool-content.css" with { type: "css" };
import canvasToolContentSheet from "./blocks/tool/content/CanvasToolContent.css" with { type: "css" };
import commandToolContentSheet from "./blocks/tool/content/CommandToolContent.css" with { type: "css" };
import fileToolContentSheet from "./blocks/tool/content/FileToolContent.css" with { type: "css" };
import modelPillSheet from "./ModelPill.css" with { type: "css" };
import pickerPositioningSheet from "./picker-positioning.css" with { type: "css" };
import providerAuthFlowPanelSheet from "./ProviderAuthFlowPanel.css" with { type: "css" };
import providerControlsSheet from "./provider-controls.css" with { type: "css" };
import providerLoginModalSheet from "./ProviderLoginModal.css" with { type: "css" };
import sessionPillSheet from "./SessionPill.css" with { type: "css" };

export default defineSurface({
  name: "chat",
  contract: agentChannels,
  styles: [
    chatSheet,
    chatBlockFrameSheet,
    messageChatBlockSheet,
    toolContentSheet,
    codeBlockSheet,
    highlightedCodeSheet,
    markdownContentSheet,
    canvasToolContentSheet,
    commandToolContentSheet,
    fileToolContentSheet,
    modelPillSheet,
    pickerPositioningSheet,
    providerAuthFlowPanelSheet,
    providerControlsSheet,
    providerLoginModalSheet,
    sessionPillSheet,
  ],
  render: (client) => <Chat client={client} />,
});
