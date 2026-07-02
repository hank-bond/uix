// chat surface contribution.

import { Chat } from "./Chat";
import { agentChannels } from "@uix/api/agent-channels";
import { defineSurface } from "@uix/api/workspace";

import sheet from "./chat.css" with { type: "css" };

export default defineSurface({
  name: "chat",
  contract: agentChannels,
  styles: [sheet],
  render: (client) => <Chat client={client} />,
});
