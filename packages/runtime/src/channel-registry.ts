// Holds the workspace's canonical channel table and routes requests and events with validation at the boundary.
//
// The registry validates unknown requests and handler responses at the
// dispatch boundary while preserving contract-owned log descriptions.
// Canonical-id reservations remain recoverable across transport acquisition
// and disposal failures. The host binds transport addresses (Electron IPC
// handlers) to the same validated runners the attachment dispatch path uses,
// so one canonical table serves both the wire and the host-stamped
// attachment context.

import { Value } from "typebox/value";

import {
  type ChannelCanonicalId,
  resolveChannelRequestContributions,
  type ResolvedChannelRequestContribution,
  toChannelCanonicalId,
} from "@uix/api/channel-resolution";
import type {
  ChannelContribution,
  ChannelEventLogOptions,
  ChannelRequestLogOptions,
  FeatureEventPublisherFactory,
} from "@uix/api/channels";
import { createFeatureEventPublisher } from "@uix/api/channels";

import type { AttachmentContext } from "./dispatch";
import type { CanonicalRequest, CanonicalResponse } from "./dispatch";
import { disposable, DisposableBag } from "./lifecycle";

export type ChannelTransportRegistrar = (
  canonicalId: ChannelCanonicalId,
  handler: (req: unknown) => Promise<unknown>,
  logOpts?: ChannelRequestLogOptions<unknown, unknown>,
) => Disposable;

export type ChannelTransportPublisher = (
  canonicalId: ChannelCanonicalId,
  payload: unknown,
  logOpts?: ChannelEventLogOptions<unknown>,
) => void;

export interface ChannelRegistryOptions {
  transportRegistrar: ChannelTransportRegistrar;
  publish?: ChannelTransportPublisher;
}

/** Bind resolved channel requests and event publication to one transport. */
export class ChannelRegistry {
  readonly #transportRegistrar: ChannelTransportRegistrar;
  readonly #publish: ChannelTransportPublisher;
  readonly #canonicalIds = new Set<ChannelCanonicalId>();
  readonly #runners = new Map<
    ChannelCanonicalId,
    (req: unknown) => Promise<unknown>
  >();

  constructor(opts: ChannelRegistryOptions) {
    this.#transportRegistrar = opts.transportRegistrar;
    this.#publish = opts.publish ?? (() => undefined);
  }

  publish(
    canonicalId: ChannelCanonicalId,
    payload: unknown,
    logOpts?: ChannelEventLogOptions<unknown>,
  ): void {
    this.#publish(canonicalId, payload, logOpts);
  }

  /**
   * Register one resolved request and return its exact transport lifetime.
   *
   * The validated runner becomes both the transport binding and the
   * attachment dispatch path. A failed transport acquisition releases the
   * reserved id. Disposal also releases the id when transport cleanup
   * throws.
   */
  register<Req, Res>(
    resolvedContribution: ResolvedChannelRequestContribution<Req, Res>,
  ): Disposable {
    const { canonicalId } = resolvedContribution;
    if (this.#canonicalIds.has(canonicalId)) {
      throw new Error(`Channel already registered: ${canonicalId}`);
    }

    const run = async (rawReq: unknown): Promise<unknown> => {
      const req = Value.Parse(resolvedContribution.requestSchema, rawReq);
      const res = await resolvedContribution.handler(req as Req);
      return Value.Parse(resolvedContribution.responseSchema, res);
    };

    this.#canonicalIds.add(canonicalId);
    this.#runners.set(canonicalId, run);
    let handlerDisposable: Disposable;
    try {
      handlerDisposable = this.#transportRegistrar(
        canonicalId,
        run,
        resolvedContribution.log as
          | ChannelRequestLogOptions<unknown, unknown>
          | undefined,
      );
    } catch (err) {
      this.#canonicalIds.delete(canonicalId);
      this.#runners.delete(canonicalId);
      throw err;
    }

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      try {
        handlerDisposable[Symbol.dispose]();
      } finally {
        this.#canonicalIds.delete(canonicalId);
        this.#runners.delete(canonicalId);
      }
    });
  }

  /**
   * Dispatch one canonical request with host-stamped attachment context.
   *
   * The context travels outside the feature payload: features receive only
   * their validated request, while the runtime dispatch machinery may scope
   * state and routing by workspace, attachment, and session. Unknown channels
   * and handler failures return explicit structured errors rather than
   * throwing, so a host can answer a connection without exception plumbing.
   */
  async dispatch(
    context: AttachmentContext,
    request: CanonicalRequest,
  ): Promise<CanonicalResponse> {
    const run = this.#runners.get(request.channel);
    if (!run) {
      return {
        ok: false,
        error: {
          code: "unknown_channel",
          message: `Unknown channel ${request.channel}`,
        },
      };
    }
    try {
      return { ok: true, value: await run(request.payload) };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "handler_error",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

/**
 * Register feature-owned channel groups as one rollback-safe lifetime.
 *
 * Every contract must name the feature that contributes it. A later failure
 * disposes all request handlers acquired earlier in the operation.
 */
export function registerChannelContributions(
  registry: ChannelRegistry,
  featureId: string,
  contributions: readonly ChannelContribution[],
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
      // The contract states its owner once, where it's defined. A mismatch
      // here means a feature is registering handlers under someone else's
      // channel namespace: always a wiring bug, never valid.
      if (contribution.feature !== featureId) {
        throw new Error(
          `Feature ${featureId} cannot register channels owned by ${contribution.feature}`,
        );
      }
      for (const resolvedContribution of resolveChannelRequestContributions(
        featureId,
        contribution,
      )) {
        bag.add(registry.register(resolvedContribution));
      }
    }
    return bag;
  } catch (err) {
    bag[Symbol.dispose]();
    throw err;
  }
}

/**
 * The `channels` capability handed to a feature's context. It closes over the
 * feature id and the registry here, so the registry can only mint a publisher for
 * the feature's own namespace, and only when the caller presents a contract. There is no
 * untyped publish surface and no way to emit onto canonical ids nobody
 * declared.
 */
export function createFeatureEventPublisherFactory(
  featureId: string,
  publisher: Pick<ChannelRegistry, "publish">,
): FeatureEventPublisherFactory {
  return {
    createPublisher: (contract) => {
      if (contract.feature !== featureId) {
        throw new Error(
          `Feature ${featureId} cannot publish events on channels owned by ${contract.feature}`,
        );
      }
      return createFeatureEventPublisher((name, payload, logOpts) => {
        publisher.publish(
          toChannelCanonicalId(featureId, name),
          payload,
          logOpts,
        );
      }, contract);
    },
  };
}
