// Projects host-owned attachment web-address snapshots into mounted feature surfaces.

import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

/** Immutable physical addressing for one attachment-target generation. */
export interface AttachmentWebAddressSnapshot {
  /** Return the physical directory URL for one substrate-selected feature. */
  readonly toFeatureRootUrl: (featureId: string) => string;
}

/** Host-owned observable address, independent from physical connection recovery. */
export interface AttachmentWebAddress {
  readonly getSnapshot: () => AttachmentWebAddressSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

const AttachmentWebAddressContext = createContext<
  AttachmentWebAddress | undefined
>(undefined);

export function AttachmentWebAddressProvider({
  address,
  children,
}: {
  readonly address?: AttachmentWebAddress;
  readonly children: ReactNode;
}): ReactNode {
  return createElement(
    AttachmentWebAddressContext.Provider,
    { value: address },
    children,
  );
}

const getUnavailableSnapshot = (): undefined => undefined;
const subscribeUnavailable = (): (() => void) => () => undefined;

/** Resolve one feature root and update only consumers when the target changes. */
export function useFeatureWebRootUrl(featureId: string): string | undefined {
  const address = useContext(AttachmentWebAddressContext);
  const snapshot = useSyncExternalStore(
    address?.subscribe ?? subscribeUnavailable,
    address?.getSnapshot ?? getUnavailableSnapshot,
    address?.getSnapshot ?? getUnavailableSnapshot,
  );
  return useMemo(
    () => snapshot?.toFeatureRootUrl(featureId),
    [featureId, snapshot],
  );
}
