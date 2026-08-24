// Generic guard capabilities that pair supervisor-owned lifetime authority with operational values.

/** A disposable teardown veto with its protected value valid under its authority. */
export interface Guard<Value> extends Disposable {
  /** Access the protected object while this guard remains live. */
  readonly value: Value;
  /** Mint another independently disposable guard on the same generation. */
  retain(origin?: string): Guard<Value>;
}

export interface GuardOptions<Value> {
  /** Domain name used only when rejected operations identify a disposed guard. */
  readonly label: string;
  /** Operational object for the exact protected generation. */
  readonly value: Value;
  /** Supervisor-owned issuance for an independently retained guard. */
  readonly retain: (origin: string) => Guard<Value>;
  /** Supervisor-owned removal of this exact guard from its live set. */
  readonly onDispose: () => void;
}

/** Bind one supervisor-issued guard lifetime to its protected generation. */
export function createGuard<Value>(options: GuardOptions<Value>): Guard<Value> {
  const { label } = options;
  let disposed = false;
  let value: Value | undefined = options.value;
  let retainGuard: GuardOptions<Value>["retain"] | undefined = options.retain;
  let disposeGuard: GuardOptions<Value>["onDispose"] | undefined =
    options.onDispose;

  function assertLive(): void {
    if (disposed) throw new Error(`${label} guard is disposed`);
  }

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    const disposeLiveGuard = disposeGuard;
    value = undefined;
    retainGuard = undefined;
    disposeGuard = undefined;
    disposeLiveGuard?.();
  };

  return {
    get value() {
      assertLive();
      return value as Value;
    },
    retain(origin = "retained") {
      assertLive();
      return (retainGuard as GuardOptions<Value>["retain"])(origin);
    },
    [Symbol.dispose]: dispose,
  };
}
