// chat surface contribution.

import { Chat } from "./Chat";
import { agentChannels } from "#shared/ipc";
import { defineSurface } from "@uix/api/workspace";

export const chatSurface = defineSurface(
  "chat",
  "agent",
  agentChannels,
  (client) => <Chat client={client} />,
);
