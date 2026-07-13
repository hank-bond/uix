import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { toChannelCanonicalId } from "./channel-normalization";
import { isIdToken } from "./contribution-id";
import type { ChannelContract } from "./channels";
import {
  FeatureSettingValueEnvelopeSchema,
  type SettingDefinitions,
} from "./settings";

export type {
  ActionContribution,
  ActionDescriptor,
  ActionGroupContribution,
  ActionLeafContribution,
  ActionInvocationResult,
  ActionNotInvokedReason,
  ActionRun,
} from "./actions";
import type {
  ActionContribution,
  ActionContributionUpdater,
  ActionDescriptor,
  ActionInvocationResult,
  RegisterActionContribution,
} from "./actions";

type GetActionSnapshot = () => readonly ActionDescriptor[];
type SubscribeToActions = (listener: () => void) => () => void;
type InvokeAction = (id: string) => Promise<ActionInvocationResult>;

const RegisterActionContributionContext = createContext<
  RegisterActionContribution | undefined
>(undefined);
const GetActionSnapshotContext = createContext<GetActionSnapshot | undefined>(
  undefined,
);
const SubscribeToActionsContext = createContext<SubscribeToActions | undefined>(
  undefined,
);
const InvokeActionContext = createContext<InvokeAction | undefined>(undefined);

export interface WorkspaceActionsProviderProps {
  getSnapshot: GetActionSnapshot;
  subscribe: SubscribeToActions;
  invoke: InvokeAction;
  children: ReactNode;
}

export function WorkspaceActionsProvider({
  getSnapshot,
  subscribe,
  invoke,
  children,
}: WorkspaceActionsProviderProps): ReactNode {
  return createElement(
    GetActionSnapshotContext.Provider,
    { value: getSnapshot },
    createElement(
      SubscribeToActionsContext.Provider,
      { value: subscribe },
      createElement(InvokeActionContext.Provider, { value: invoke }, children),
    ),
  );
}

export interface FeatureActionsProviderProps {
  register: RegisterActionContribution;
  children: ReactNode;
}

export function FeatureActionsProvider({
  register,
  children,
}: FeatureActionsProviderProps): ReactNode {
  return createElement(
    RegisterActionContributionContext.Provider,
    { value: register },
    children,
  );
}

export function useActionContribution(contribution: ActionContribution): void {
  const register = useContext(RegisterActionContributionContext);
  if (!register) {
    throw new Error("FeatureActionsProvider is missing");
  }

  const contributionRef = useRef(contribution);
  contributionRef.current = contribution;
  const registrationRef = useRef<ActionContributionUpdater>();
  const registeredValueRef = useRef<ActionContribution>();

  useLayoutEffect(() => {
    const registeredValue = contributionRef.current;
    const registration = register(registeredValue);
    registrationRef.current = registration;
    registeredValueRef.current = registeredValue;
    return () => {
      registration[Symbol.dispose]();
      if (registrationRef.current === registration) {
        registrationRef.current = undefined;
        registeredValueRef.current = undefined;
      }
    };
  }, [register]);

  useLayoutEffect(() => {
    if (registeredValueRef.current === contribution) return;
    registrationRef.current?.update(contribution);
    registeredValueRef.current = contribution;
  }, [contribution]);
}

export function useActionCatalog(): readonly ActionDescriptor[] {
  const getSnapshot = useContext(GetActionSnapshotContext);
  const subscribe = useContext(SubscribeToActionsContext);
  if (!getSnapshot || !subscribe) {
    throw new Error("WorkspaceActionsProvider is missing");
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useInvokeAction(): InvokeAction {
  const invoke = useContext(InvokeActionContext);
  if (!invoke) {
    throw new Error("WorkspaceActionsProvider is missing");
  }
  return invoke;
}

export interface WorkspaceClient {
  readonly workspaceId: string;
  readonly request: <Req, Res = void>(name: string, req: Req) => Promise<Res>;
  readonly subscribe: <Event>(
    name: string,
    handler: (event: Event) => void,
  ) => () => void;
}

// The workspace client context lives here — not in page code — because
// surface modules share this exact module instance with the page (via the
// shared-modules global), so the context identity matches and feature
// components can call useWorkspaceClient directly.
const WorkspaceClientContext = createContext<WorkspaceClient | undefined>(
  undefined,
);

export interface WorkspaceClientProviderProps {
  client: WorkspaceClient;
  children: ReactNode;
}

export function WorkspaceClientProvider({
  client,
  children,
}: WorkspaceClientProviderProps): ReactNode {
  return createElement(
    WorkspaceClientContext.Provider,
    { value: client },
    children,
  );
}

export function useWorkspaceClient(): WorkspaceClient {
  const client = useContext(WorkspaceClientContext);
  if (!client) {
    throw new Error("WorkspaceClientProvider is missing");
  }
  return client;
}

const FeatureSettingsContext = createContext<FeatureSettingsClient | undefined>(
  undefined,
);

type FeatureSettingValue<
  Settings extends SettingDefinitions,
  Key extends keyof Settings,
> = Static<Settings[Key]["schema"]>;

export interface FeatureSettingsClient<
  Settings extends SettingDefinitions = SettingDefinitions,
> {
  get<Key extends keyof Settings & string>(
    key: Key,
  ): Promise<FeatureSettingValue<Settings, Key> | undefined>;
  set<Key extends keyof Settings & string>(
    key: Key,
    value: FeatureSettingValue<Settings, Key>,
  ): Promise<void>;
  onChange<Key extends keyof Settings & string>(
    key: Key,
    handler: (value: FeatureSettingValue<Settings, Key>) => void,
  ): () => void;
}

export interface FeatureSettingsProviderProps {
  client: FeatureSettingsClient;
  children: ReactNode;
}

export function FeatureSettingsProvider({
  client,
  children,
}: FeatureSettingsProviderProps): ReactNode {
  return createElement(
    FeatureSettingsContext.Provider,
    { value: client },
    children,
  );
}

function useFeatureSettingsClient(): FeatureSettingsClient {
  const client = useContext(FeatureSettingsContext);
  if (!client) {
    throw new Error("FeatureSettingsProvider is missing");
  }
  return client;
}

export interface FeatureSettingState<Value> {
  value: Value | undefined;
  loading: boolean;
  error: Error | undefined;
  set(value: Value): Promise<void>;
}

export function useFeatureSetting<
  const Settings extends SettingDefinitions,
  const Key extends keyof Settings & string,
>(
  featureSettings: Settings,
  key: Key,
): FeatureSettingState<FeatureSettingValue<Settings, Key>> {
  const settings = useFeatureSettingsClient();
  const schema = featureSettings[key].schema;
  const [value, setValue] = useState<
    FeatureSettingValue<Settings, Key> | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    void settings
      .get(key)
      .then((raw) => {
        if (!alive) return;
        setValue(parseFeatureSettingValue(schema, raw));
      })
      .catch((thrown: unknown) => {
        if (!alive) return;
        setError(thrown instanceof Error ? thrown : new Error(String(thrown)));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const unsubscribe = settings.onChange(key, (raw) => {
      setValue(parseFeatureSettingValue(schema, raw));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [key, schema, settings]);

  const set = useCallback(
    async (next: FeatureSettingValue<Settings, Key>) => {
      await settings.set(key, next);
      setValue(parseFeatureSettingValue(schema, next));
    },
    [key, schema, settings],
  );

  return useMemo(
    () => ({ value, loading, error, set }),
    [value, loading, error, set],
  );
}

export function createFeatureSettingsClient(
  workspace: WorkspaceClient,
  featureId: string,
): FeatureSettingsClient {
  return {
    get: (key) =>
      workspace.request(toChannelCanonicalId("uix", "get_setting"), {
        featureId,
        key,
      }),
    set: async (key, value) => {
      await workspace.request(toChannelCanonicalId("uix", "set_setting"), {
        featureId,
        key,
        value,
      });
    },
    onChange: (key, handler) =>
      workspace.subscribe(
        toChannelCanonicalId("uix", "setting_changed"),
        (raw) => {
          const event = Value.Parse(FeatureSettingValueEnvelopeSchema, raw);
          if (event.featureId === featureId && event.key === key) {
            handler(event.value);
          }
        },
      ),
  };
}

function parseFeatureSettingValue<Value>(
  schema: TSchema,
  value: unknown,
): Value | undefined {
  if (value === undefined) return undefined;
  return Value.Parse(schema, value) as Value;
}

type RequestClient<C extends ChannelContract> = {
  [K in keyof C["requests"] & string]: (
    req: Static<C["requests"][K]["requestSchema"]>,
  ) => Promise<Static<C["requests"][K]["responseSchema"]>>;
};

type EventClient<C extends ChannelContract> = {
  [K in keyof C["events"] & string]: (
    handler: (event: Static<C["events"][K]["event"]>) => void,
  ) => () => void;
};

export interface ChannelClient<C extends ChannelContract> {
  requests: RequestClient<C>;
  events: EventClient<C>;
}

export function createChannelClient<const C extends ChannelContract>(
  workspace: WorkspaceClient,
  contract: C,
): ChannelClient<C> {
  const requests = {} as Record<string, unknown>;
  for (const name of Object.keys(contract.requests)) {
    const canonicalId = toChannelCanonicalId(contract.feature, name);
    requests[name] = (payload: unknown) =>
      workspace.request(canonicalId, payload);
  }

  const events = {} as Record<string, unknown>;
  for (const [name, evt] of Object.entries(contract.events)) {
    const canonicalId = toChannelCanonicalId(contract.feature, name);
    // Events cross the transport unvalidated (the registry only parses
    // request/response payloads), so the schema check lives here.
    events[name] = (handler: (payload: unknown) => void) =>
      workspace.subscribe(canonicalId, (raw: unknown) =>
        handler(Value.Parse(evt.event, raw)),
      );
  }

  return { requests, events } as ChannelClient<C>;
}

/**
 * Opaque surface contribution — the workspace's surface list is
 * heterogeneous, so the contract's type parameter is erased here. The typed
 * surface is created via {@link defineSurface}, which captures the generic at
 * definition time and pushes the unavoidable cast into the substrate.
 */
export interface SurfaceContribution {
  readonly name: string;
  readonly contract?: ChannelContract;
  /** Adopted into the document while the surface is mounted. */
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: (client: unknown) => ReactNode;
}

/** A surface bound to a channel contract; `render` gets the typed client. */
export interface SurfaceDefinition<C extends ChannelContract> {
  readonly name: string;
  readonly contract: C;
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: (client: ChannelClient<C>) => ReactNode;
}

/** A surface with no channel binding — pure presentation or local state. */
export interface ContractlessSurfaceDefinition extends Omit<
  SurfaceDefinition<ChannelContract>,
  "contract" | "render"
> {
  readonly render: () => ReactNode;
}

/**
 * Defines a surface. With a `contract`, `render`'s `client` parameter is
 * fully typed from it — features never cast; the client is minted by the
 * substrate mount under the contract's own channel id. A surface module's
 * **default export** must be this result — that is how the runtime loader
 * finds the surface. The single unavoidable cast (erasing the generic for
 * the heterogeneous surface list) lives here in the substrate.
 */
export function defineSurface<const C extends ChannelContract>(
  surface: SurfaceDefinition<C>,
): SurfaceContribution;
export function defineSurface(
  surface: ContractlessSurfaceDefinition,
): SurfaceContribution;
export function defineSurface(
  surface: Omit<SurfaceContribution, "render"> & {
    readonly render: (client: never) => ReactNode;
  },
): SurfaceContribution {
  if (!isIdToken(surface.name)) {
    throw new Error(
      `Invalid surface name: ${surface.name}. Expected a lowercase id token.`,
    );
  }
  return {
    name: surface.name,
    ...(surface.contract ? { contract: surface.contract } : {}),
    ...(surface.styles ? { styles: surface.styles } : {}),
    render: surface.render as (client: unknown) => ReactNode,
  };
}
