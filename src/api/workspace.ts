export interface WorkspaceClient {
  readonly request: <Req, Res>(name: string, req: Req) => Promise<Res>;
  readonly subscribe: <Event>(
    name: string,
    handler: (event: Event) => void,
  ) => () => void;
}

export interface FeatureChannelClient {
  readonly featureId: string;
  readonly request: <Req, Res>(name: string, req: Req) => Promise<Res>;
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
    request<Req, Res>(name: string, req: Req): Promise<Res> {
      return workspace.request(`${featureId}.${name}`, req);
    },
    subscribe<Event>(
      name: string,
      handler: (event: Event) => void,
    ): () => void {
      return workspace.subscribe(`${featureId}.${name}`, handler);
    },
  };
}
