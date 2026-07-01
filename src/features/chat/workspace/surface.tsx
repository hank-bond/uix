// chat surface contribution.

import { Chat } from "./Chat";
import type { SurfaceLayout } from "../../../renderer/workspace/layout";

export const chatSurface: SurfaceLayout = {
  name: "chat",
  render: () => <Chat />,
};
