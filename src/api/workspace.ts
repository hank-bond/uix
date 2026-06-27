import { channelCanonicalId } from "#shared/channel-normalization";

export interface WorkspaceClient {
  readonly request: <Req, Res = void>(name: string, req: Req) => Promise<Res>;
  readonly subscribe: <Event>(
    name: string,
    handler: (event: Event) => void,
  ) => () => void;
}

export interface FeatureChannelClient {
  readonly featureId: string;
  readonly request: <Req, Res = void>(name: string, req: Req) => Promise<Res>;
  readonly subscribe: <Event>(
    name: string,
    handler: (event: Event) => void,
  ) => () => void;
}

export function createFeatureChannelClient(
  workspace: WorkspaceClient,
  featureId: string,
): FeatureChannelClient {
  return {
    featureId,
    request<Req, Res = void>(name: string, req: Req): Promise<Res> {
      return workspace.request(
        channelCanonicalId(featureId, name) as string,
        req,
      );
    },
    subscribe<Event>(
      name: string,
      handler: (event: Event) => void,
    ): () => void {
      return workspace.subscribe(
        channelCanonicalId(featureId, name) as string,
        handler,
      );
    },
  };
}
