// Adapts Electron menu selections into validated renderer action invocations.

import { Value } from "typebox/value";

import { ActionIdSchema } from "@uix/api/actions";
import type { ActionInvocationSource } from "@uix/client/workspace";
import { Channels, type ChannelTransport } from "#shared/ipc";

export function createElectronActionInvocationSource(
  transport: ChannelTransport,
): ActionInvocationSource {
  return {
    subscribe(handler) {
      return transport.subscribe(Channels.actionInvocation, (payload) => {
        handler(Value.Parse(ActionIdSchema, payload));
      });
    },
  };
}
