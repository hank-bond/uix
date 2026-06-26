import { featureChannelId } from "./channels";

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
      return workspace.request(featureChannelId(featureId, name), req);
    },
    subscribe<Event>(
      name: string,
      handler: (event: Event) => void,
    ): () => void {
      return workspace.subscribe(featureChannelId(featureId, name), handler);
    },
  };
}
