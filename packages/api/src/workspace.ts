// Feature workspace client and surface contracts.
//
// The renderer-facing author surface: the workspace client and session handle
// bind feature components to the selected session, the providers and hooks
// expose actions and settings, and `defineSurface` declares the surface the
// substrate mounts.

import type { ReactNode } from "react";
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
import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";

import type { AgentSnapshot, SessionSummary } from "./agent-channels";
import { toChannelCanonicalId } from "./channel-resolution";
import type { ChannelContract } from "./channels";
import { isIdToken } from "./contribution-id";
import type { FeatureWebRootUrl } from "./feature-web-root-url";
import {
  FeatureSettingValueEnvelopeSchema,
  type SettingsDefinition,
} from "./settings";
import {
  createWebRouteClient,
  type WebRouteClient,
  type WebRouteContract,
} from "./web-routes";

export type {
  ActionCatalog,
  ActionCatalogEntry,
  ActionContribution,
  ActionGroupContribution,
  ActionInvocationResult,
  ActionLeafContribution,
  ActionNotInvokedReason,
  ActionRunner,
} from "./actions";
import type {
  ActionCatalog,
  ActionContribution,
  ActionContributionRegistrar,
  ActionContributionUpdater,
  ActionInvocationResult,
} from "./actions";

// Section: Action contexts
const ActionContributionRegistrarContext = createContext<
  ActionContributionRegistrar | undefined
>(undefined);
const GetActionCatalogSnapshotContext = createContext<
  (() => ActionCatalog) | undefined
>(undefined);
const SubscribeToActionCatalogContext = createContext<
  ((listener: () => void) => () => void) | undefined
>(undefined);
const InvokeActionContext = createContext<
  ((id: string) => Promise<ActionInvocationResult>) | undefined
>(undefined);
type SessionSummaryProjection = Readonly<SessionSummary>;

// Section: Workspace session
export interface WorkspaceSessionHandle {
  readonly activeSession: SessionSummaryProjection | undefined;
  readonly recentSessions: readonly SessionSummaryProjection[] | undefined;
  /** Changes only when the selected graph changes, not when its summary hydrates. */
  readonly sessionSelectionVersion: number;
  /** False only while another session mutation is pending. */
  readonly canSwitchSession: boolean;
  readonly loadActiveHistory: () => Promise<AgentSnapshot>;
  /** Returns undefined while another session mutation is pending. */
  readonly switchSession: (
    sessionId: string,
  ) => Promise<SessionSummaryProjection | undefined>;
  /** Returns undefined while another session mutation is pending. */
  readonly setSessionTitle: (
    sessionId: string,
    title: string | null,
  ) => Promise<SessionSummaryProjection | undefined>;
}

const WorkspaceSessionContext = createContext<
  WorkspaceSessionHandle | undefined
>(undefined);

export interface WorkspaceSessionProviderProps {
  session: WorkspaceSessionHandle;
  children: ReactNode;
}

export function WorkspaceSessionProvider({
  session,
  children,
}: WorkspaceSessionProviderProps): ReactNode {
  return createElement(
    WorkspaceSessionContext.Provider,
    { value: session },
    children,
  );
}

export function useWorkspaceSession(): WorkspaceSessionHandle {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error("WorkspaceSessionProvider is missing");
  return session;
}

// Section: Action providers and hooks
export interface WorkspaceActionsProviderProps {
  getCatalogSnapshot: () => ActionCatalog;
  subscribeToCatalog: (listener: () => void) => () => void;
  invoke: (id: string) => Promise<ActionInvocationResult>;
  children: ReactNode;
}

export function WorkspaceActionsProvider({
  getCatalogSnapshot,
  subscribeToCatalog,
  invoke,
  children,
}: WorkspaceActionsProviderProps): ReactNode {
  return createElement(
    GetActionCatalogSnapshotContext.Provider,
    { value: getCatalogSnapshot },
    createElement(
      SubscribeToActionCatalogContext.Provider,
      { value: subscribeToCatalog },
      createElement(InvokeActionContext.Provider, { value: invoke }, children),
    ),
  );
}

export interface FeatureActionsProviderProps {
  register: ActionContributionRegistrar;
  children: ReactNode;
}

export function FeatureActionsProvider({
  register,
  children,
}: FeatureActionsProviderProps): ReactNode {
  return createElement(
    ActionContributionRegistrarContext.Provider,
    { value: register },
    children,
  );
}

export function useActionContribution(contribution: ActionContribution): void {
  const register = useContext(ActionContributionRegistrarContext);
  if (!register) {
    throw new Error("FeatureActionsProvider is missing");
  }

  const contributionRef = useRef(contribution);
  contributionRef.current = contribution;
  const updaterRef = useRef<ActionContributionUpdater>();
  const registeredValueRef = useRef<ActionContribution>();

  useLayoutEffect(() => {
    const registeredValue = contributionRef.current;
    const updater = register(registeredValue);
    updaterRef.current = updater;
    registeredValueRef.current = registeredValue;
    return () => {
      updater[Symbol.dispose]();
      if (updaterRef.current === updater) {
        updaterRef.current = undefined;
        registeredValueRef.current = undefined;
      }
    };
  }, [register]);

  useLayoutEffect(() => {
    if (registeredValueRef.current === contribution) return;
    updaterRef.current?.update(contribution);
    registeredValueRef.current = contribution;
  }, [contribution]);
}

export function useActionCatalog(): ActionCatalog {
  const getSnapshot = useContext(GetActionCatalogSnapshotContext);
  const subscribe = useContext(SubscribeToActionCatalogContext);
  if (!getSnapshot || !subscribe) {
    throw new Error("WorkspaceActionsProvider is missing");
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useInvokeAction(): (
  id: string,
) => Promise<ActionInvocationResult> {
  const invoke = useContext(InvokeActionContext);
  if (!invoke) {
    throw new Error("WorkspaceActionsProvider is missing");
  }
  return invoke;
}

// Section: Workspace client
/** Tracks accepted physical connection replacements for snapshot recovery. */
export interface WorkspaceConnectionVersionObservable {
  /** Return the current monotonic connection version. */
  readonly getSnapshot: () => number;
  /** Observe version changes and return the matching cleanup operation. */
  readonly subscribe: (listener: () => void) => () => void;
}

export interface WorkspaceClient {
  readonly workspaceId: string;
  /** Accepted channel namespaces, when binding inside a mounted feature surface. */
  readonly channelNamespaces?: readonly string[];
  readonly request: (channel: string, req: unknown) => Promise<unknown>;
  readonly subscribe: (
    channel: string,
    handler: (event: unknown) => void,
  ) => () => void;
  /** Map a logical UIX resource URL or origin to this host's browser transport. */
  readonly resolveResourceUrl?: (logicalUrl: string) => string;
  /** Notifies snapshot consumers after the host accepts a replacement connection. */
  readonly connectionVersionObservable?: WorkspaceConnectionVersionObservable;
}

/** Resolve a logical resource address without making Electron callers provide an identity adapter. */
export function resolveWorkspaceResourceUrl(
  client: WorkspaceClient,
  logicalUrl: string,
): string {
  return client.resolveResourceUrl?.(logicalUrl) ?? logicalUrl;
}

// The workspace client context lives here, not in page code, because
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

const getStaticConnectionVersion = (): number => 0;
const subscribeStaticConnectionVersion = (): (() => void) => () => undefined;

export function WorkspaceClientProvider({
  client,
  children,
}: WorkspaceClientProviderProps): ReactNode {
  const connectionVersionObservable = client.connectionVersionObservable;
  const version = useSyncExternalStore(
    connectionVersionObservable?.subscribe ?? subscribeStaticConnectionVersion,
    connectionVersionObservable?.getSnapshot ?? getStaticConnectionVersion,
    connectionVersionObservable?.getSnapshot ?? getStaticConnectionVersion,
  );
  // Preserve the mounted workspace while changing the context value identity.
  // Snapshot-backed effects key on this value, so an accepted replacement
  // connection resubscribes first and then re-reads current authoritative state.
  const clientAtConnectionVersion = useMemo<WorkspaceClient>(
    () => ({ ...client }),
    [client, version],
  );
  return createElement(
    WorkspaceClientContext.Provider,
    { value: clientAtConnectionVersion },
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

// Section: Feature web routes
// `undefined` means no provider; `null` means the mounted host has not supplied
// viewpoint web addressing. Keeping those states distinct gives surface
// authors an actionable error.
const FeatureWebRouteRootContext = createContext<
  FeatureWebRootUrl | null | undefined
>(undefined);

export interface FeatureWebRouteProviderProps {
  /** Physical directory URL for this feature at one attachment-target generation. */
  featureRootUrl?: FeatureWebRootUrl;
  children: ReactNode;
}

/** Bind descendants to the mounted feature's current viewpoint web root. */
export function FeatureWebRouteProvider({
  featureRootUrl,
  children,
}: FeatureWebRouteProviderProps): ReactNode {
  return createElement(
    FeatureWebRouteRootContext.Provider,
    { value: featureRootUrl ?? null },
    children,
  );
}

/** Derive one typed route client without exposing feature or binding identity. */
export function useWebRouteClient<const Contract extends WebRouteContract>(
  contract: Contract,
): WebRouteClient<Contract> {
  const featureRootUrl = useContext(FeatureWebRouteRootContext);
  const client = useMemo(
    () =>
      typeof featureRootUrl === "string"
        ? createWebRouteClient(contract, featureRootUrl)
        : undefined,
    [contract, featureRootUrl],
  );
  if (featureRootUrl === undefined) {
    throw new Error("FeatureWebRouteProvider is missing");
  }
  if (!client) {
    throw new Error("Viewpoint web routes are unavailable in this host");
  }
  return client;
}

// Section: Feature settings
const FeatureSettingsContext = createContext<FeatureSettingsClient | undefined>(
  undefined,
);

type SettingsValue<Settings extends SettingsDefinition> = Static<
  Settings["schema"]
>;
type FeatureSettingKey<Settings extends SettingsDefinition> =
  keyof SettingsValue<Settings> & string;
type FeatureSettingValue<
  Settings extends SettingsDefinition,
  Key extends FeatureSettingKey<Settings>,
> = Exclude<SettingsValue<Settings>[Key], undefined>;

export interface FeatureSettingsClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  onChange(key: string, handler: (value: unknown) => void): () => void;
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
  const Settings extends SettingsDefinition,
  const Key extends FeatureSettingKey<Settings>,
>(
  featureSettings: Settings,
  key: Key,
): FeatureSettingState<FeatureSettingValue<Settings, Key>> {
  const settings = useFeatureSettingsClient();
  const schema = settingSchema(featureSettings.schema, key);
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

function settingSchema(schema: TSchema, key: string): TSchema {
  const objectSchema = schema as TSchema & {
    properties?: Record<string, TSchema>;
    patternProperties?: Record<string, TSchema>;
  };
  const property = objectSchema.properties?.[key];
  if (property) return property;
  for (const [pattern, valueSchema] of Object.entries(
    objectSchema.patternProperties ?? {},
  )) {
    if (new RegExp(pattern).test(key)) return valueSchema;
  }
  throw new Error(`Unknown setting: ${key}`);
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TypeScript infers Value contextually at each call site from the setState argument. Inlining to unknown would force casts.
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

// Section: Channel client
export interface ChannelClient<C extends ChannelContract> {
  requests: RequestClient<C>;
  events: EventClient<C>;
}

/** Create a client for one explicitly selected channel namespace. */
export function createChannelClient<const C extends ChannelContract>(
  workspace: WorkspaceClient,
  namespace: string,
  contract: C,
): ChannelClient<C> {
  if (
    workspace.channelNamespaces &&
    !workspace.channelNamespaces.includes(namespace)
  ) {
    throw new Error(`Channel namespace is unavailable: ${namespace}`);
  }

  const requests = {} as Record<string, unknown>;
  for (const name of Object.keys(contract.requests)) {
    const canonicalId = toChannelCanonicalId(namespace, name);
    requests[name] = (payload: unknown) =>
      workspace.request(canonicalId, payload);
  }

  const events = {} as Record<string, unknown>;
  for (const [name, evt] of Object.entries(contract.events)) {
    const canonicalId = toChannelCanonicalId(namespace, name);
    // Events cross the transport unvalidated (the registry only parses
    // request/response payloads), so the schema check lives here.
    events[name] = (handler: (payload: unknown) => void) =>
      workspace.subscribe(canonicalId, (raw: unknown) => {
        handler(Value.Parse(evt.event, raw));
      });
  }

  return { requests, events } as ChannelClient<C>;
}

/**
 * Opaque surface contribution. The workspace's surface list is
 * heterogeneous, so this contract erases its type parameter here. The caller
 * creates the typed surface via {@link defineSurface}, which captures the generic at
 * definition time and pushes the unavoidable cast into the substrate.
 */
// Section: Surfaces
export type SurfaceChannelContracts = Readonly<Record<string, ChannelContract>>;

type SurfaceChannelClients<Channels extends SurfaceChannelContracts> = {
  readonly [Namespace in keyof Channels]: ChannelClient<Channels[Namespace]>;
};

export interface SurfaceContribution {
  readonly name: string;
  readonly channels?: SurfaceChannelContracts;
  /** Adopted into the document while the surface is mounted. */
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: (clients: unknown) => ReactNode;
}

/** A surface with explicitly namespaced channel contracts. */
export interface SurfaceDefinition<Channels extends SurfaceChannelContracts> {
  readonly name: string;
  readonly channels: Channels;
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: (clients: SurfaceChannelClients<Channels>) => ReactNode;
}

/** A surface with no channel binding: pure presentation or local state. */
export interface ContractlessSurfaceDefinition {
  readonly name: string;
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: () => ReactNode;
}

/**
 * Defines a surface. Each `channels` key is the provider namespace for its
 * contract and the local name of the typed client passed to `render`. Features
 * never cast. A surface module must export this result as `surface`
 * (`export const surface = defineSurface(...)`). That is how the runtime loader
 * finds it. The single unavoidable cast, which erases the generic for the
 * heterogeneous surface list, lives here in the substrate. A mounted surface
 * receives only workspace-scoped services: its channel clients, a
 * feature-bound settings client, an action registrar, and read-only session
 * capabilities. It never receives Electron, main-process registries, or
 * another feature's settings handle.
 */
export function defineSurface<const Channels extends SurfaceChannelContracts>(
  surface: SurfaceDefinition<Channels>,
): SurfaceContribution;
export function defineSurface(
  surface: ContractlessSurfaceDefinition,
): SurfaceContribution;
export function defineSurface(
  surface: Omit<SurfaceContribution, "render"> & {
    readonly render: (clients: never) => ReactNode;
  },
): SurfaceContribution {
  if (!isIdToken(surface.name)) {
    throw new Error(
      `Invalid surface name: ${surface.name}. Expected a lowercase id token.`,
    );
  }
  return {
    name: surface.name,
    ...(surface.channels ? { channels: surface.channels } : {}),
    ...(surface.styles ? { styles: surface.styles } : {}),
    render: surface.render as (clients: unknown) => ReactNode,
  };
}
