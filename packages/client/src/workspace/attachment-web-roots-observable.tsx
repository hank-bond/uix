// Provides observable attachment web roots to mounted feature surfaces.

import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { FeatureWebRootUrl } from "@uix/api/feature-web-root-url";

/** Physical feature-root URLs fixed to one attachment-target generation. */
export interface AttachmentWebRootsSnapshot {
  /** Return the physical directory URL for one substrate-selected feature. */
  readonly toFeatureRootUrl: (featureId: string) => FeatureWebRootUrl;
}

/** Provides current attachment web roots and notifies listeners when retargeting replaces them. */
export interface AttachmentWebRootsObservable {
  readonly getSnapshot: () => AttachmentWebRootsSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

const AttachmentWebRootsObservableContext = createContext<
  AttachmentWebRootsObservable | undefined
>(undefined);

export function AttachmentWebRootsObservableProvider({
  observable,
  children,
}: {
  readonly observable?: AttachmentWebRootsObservable;
  readonly children: ReactNode;
}): ReactNode {
  return createElement(
    AttachmentWebRootsObservableContext.Provider,
    { value: observable },
    children,
  );
}

const getUnavailableSnapshot = (): undefined => undefined;
const subscribeUnavailable = (): (() => void) => () => undefined;

/** Resolve one feature's web root and rerender its consumers after retargeting. */
export function useFeatureWebRootUrl(
  featureId: string,
): FeatureWebRootUrl | undefined {
  const observable = useContext(AttachmentWebRootsObservableContext);
  const snapshot = useSyncExternalStore(
    observable?.subscribe ?? subscribeUnavailable,
    observable?.getSnapshot ?? getUnavailableSnapshot,
    observable?.getSnapshot ?? getUnavailableSnapshot,
  );
  return useMemo(
    () => snapshot?.toFeatureRootUrl(featureId),
    [featureId, snapshot],
  );
}
