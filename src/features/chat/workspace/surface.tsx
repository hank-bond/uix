// chat surface contribution.

import { Chat } from "./Chat";
import { agentChannels } from "#shared/ipc";
import { defineSurface } from "@uix/api/workspace";

export default defineSurface({
  name: "chat",
  contract: agentChannels,
  render: (client) => <Chat client={client} />,
});
