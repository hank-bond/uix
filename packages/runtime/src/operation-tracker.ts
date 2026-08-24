// Provides lexical cancellable operations that a parent can cancel and join during shutdown.

import { disposable } from "./lifecycle";

/** Narrow cancellation authority stored by the domain owner of active work. */
export interface OperationControl {
  /** Request cancellation and wait for the operation's lexical scope to end. */
  cancel(reason?: unknown): Promise<void>;
}

/** One active operation whose lexical disposal is its completion boundary. */
export interface TrackedOperation extends AsyncDisposable {
  readonly signal: AbortSignal;
  readonly control: OperationControl;
  /** Run one phase with cancellation checks before and after its await. */
  run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /** Connect cancellation to one concrete stop mechanism. */
  onCancel(stop: () => void | Promise<void>): Disposable;
}

interface CancelRegistration {
  readonly stop: () => void | Promise<void>;
  active: boolean;
  invoked: boolean;
}

interface OperationRecord {
  readonly controller: AbortController;
  readonly completion: Promise<void>;
  readonly resolveCompletion: () => void;
  readonly rejectCompletion: (error: unknown) => void;
  readonly registrations: Set<CancelRegistration>;
  readonly cancellationTasks: Array<Promise<void>>;
  disposal?: Promise<void>;
}

/**
 * Owns admission and shutdown cancellation for one group of lexical
 * operations. Acquired operations complete through `await using`. Parent
 * disposal cancels every active operation and joins those lexical scopes.
 */
export class OperationTracker implements AsyncDisposable {
  readonly #operations = new Set<OperationRecord>();
  readonly #completionFailures: unknown[] = [];
  #disposal: Promise<void> | undefined;
  #disposing = false;

  /** Register one active operation. Its async disposal marks completion. */
  acquire(): TrackedOperation {
    if (this.#disposing) throw new Error("Operation tracker is disposing");

    let resolveCompletion!: () => void;
    let rejectCompletion!: (error: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    // Parent disposal reports failures. Detached operations must not emit an
    // unhandled rejection before that owner boundary is reached.
    void completion.catch(() => undefined);

    const record: OperationRecord = {
      controller: new AbortController(),
      completion,
      resolveCompletion,
      rejectCompletion,
      registrations: new Set(),
      cancellationTasks: [],
    };
    this.#operations.add(record);

    const cancel = (reason?: unknown): Promise<void> => {
      this.#requestCancellation(record, reason);
      return record.completion;
    };

    return {
      signal: record.controller.signal,
      control: { cancel },
      async run(work) {
        record.controller.signal.throwIfAborted();
        const result = await work(record.controller.signal);
        record.controller.signal.throwIfAborted();
        return result;
      },
      onCancel: (stop) => this.#registerCancellation(record, stop),
      [Symbol.asyncDispose]: () => this.#complete(record),
    };
  }

  [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposing = true;
    this.#disposal = (async () => {
      const operations = [...this.#operations];
      for (const operation of operations) {
        this.#requestCancellation(
          operation,
          new Error("Operation owner is shutting down"),
        );
      }
      await Promise.allSettled(operations.map(({ completion }) => completion));
      if (this.#completionFailures.length > 0) {
        throw new AggregateError(
          this.#completionFailures,
          "One or more operation completions failed",
        );
      }
    })();
    return this.#disposal;
  }

  #registerCancellation(
    record: OperationRecord,
    stop: () => void | Promise<void>,
  ): Disposable {
    if (record.disposal) throw new Error("Operation is completing");
    const registration: CancelRegistration = {
      stop,
      active: true,
      invoked: false,
    };
    record.registrations.add(registration);
    if (record.controller.signal.aborted) {
      this.#invokeCancellation(record, registration);
    }
    return disposable(() => {
      registration.active = false;
      record.registrations.delete(registration);
    });
  }

  #requestCancellation(record: OperationRecord, reason?: unknown): void {
    if (record.disposal) return;
    record.controller.abort(reason);
    for (const registration of record.registrations) {
      this.#invokeCancellation(record, registration);
    }
  }

  #invokeCancellation(
    record: OperationRecord,
    registration: CancelRegistration,
  ): void {
    if (!registration.active || registration.invoked) return;
    registration.invoked = true;
    const task = Promise.resolve().then(registration.stop);
    // The operation completion owns reporting for cancellation failures.
    void task.catch(() => undefined);
    record.cancellationTasks.push(task);
  }

  #complete(record: OperationRecord): Promise<void> {
    if (record.disposal) return record.disposal;
    record.disposal = (async () => {
      const results = await Promise.allSettled(record.cancellationTasks);
      record.registrations.clear();
      this.#operations.delete(record);
      const failures: unknown[] = [];
      for (const result of results) {
        if (result.status === "rejected") failures.push(result.reason);
      }
      if (failures.length === 0) {
        record.resolveCompletion();
        return;
      }
      const failure = new AggregateError(
        failures,
        "Operation cancellation failed",
      );
      this.#completionFailures.push(failure);
      record.rejectCompletion(failure);
    })();
    return record.disposal;
  }
}
