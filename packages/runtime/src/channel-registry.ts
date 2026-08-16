// Owns one workspace's canonical channel table, prepared dispatches, and typed event publication.

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

import type {
  AttachmentDispatchContext,
  CanonicalRequest,
  CanonicalResponse,
  PreparedDispatch,
} from "./dispatch";
import { disposable, DisposableBag } from "./lifecycle";

export type ChannelEventPublisher = (
  canonicalId: ChannelCanonicalId,
  payload: unknown,
  logOpts?: ChannelEventLogOptions<unknown>,
) => void;

export interface ChannelRegistryOptions {
  publish?: ChannelEventPublisher;
}

export interface ChannelRequestRegistration<Req, Res> {
  readonly canonicalId: ChannelCanonicalId;
  readonly requestSchema: ResolvedChannelRequestContribution<
    Req,
    Res
  >["requestSchema"];
  readonly responseSchema: ResolvedChannelRequestContribution<
    Req,
    Res
  >["responseSchema"];
  readonly handler: (
    request: Req,
    context: AttachmentDispatchContext,
  ) => Res | Promise<Res>;
  readonly log?: ChannelRequestLogOptions<Req, Res>;
}

interface RegisteredRunner {
  readonly logOptions: ChannelRequestLogOptions<unknown, unknown>;
  run(context: AttachmentDispatchContext, payload: unknown): Promise<unknown>;
}

/** One canonical request table for feature and substrate handlers alike. */
export class ChannelRegistry {
  readonly #publish: ChannelEventPublisher;
  readonly #runners = new Map<ChannelCanonicalId, RegisteredRunner>();

  constructor(opts: ChannelRegistryOptions = {}) {
    this.#publish = opts.publish ?? (() => undefined);
  }

  publish(
    canonicalId: ChannelCanonicalId,
    payload: unknown,
    logOpts?: ChannelEventLogOptions<unknown>,
  ): void {
    this.#publish(canonicalId, payload, logOpts);
  }

  /** Current canonical request ids for diagnostics and composition tests. */
  listCanonicalIds(): readonly ChannelCanonicalId[] {
    return [...this.#runners.keys()];
  }

  /** Register one validated handler in the workspace's canonical table. */
  register<Req, Res>(
    registration: ChannelRequestRegistration<Req, Res>,
  ): Disposable {
    const { canonicalId } = registration;
    if (this.#runners.has(canonicalId)) {
      throw new Error(`Channel already registered: ${canonicalId}`);
    }

    const runner: RegisteredRunner = {
      logOptions:
        (registration.log as
          | ChannelRequestLogOptions<unknown, unknown>
          | undefined) ?? {},
      async run(context, payload) {
        const request = Value.Parse(registration.requestSchema, payload) as Req;
        const response = await registration.handler(request, context);
        return Value.Parse(registration.responseSchema, response);
      },
    };
    this.#runners.set(canonicalId, runner);

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      if (this.#runners.get(canonicalId) === runner) {
        this.#runners.delete(canonicalId);
      }
    });
  }

  /**
   * Join immutable attachment context with one resolved channel entry.
   * Unknown requests receive a payload-redacting log policy.
   */
  prepare(
    context: AttachmentDispatchContext,
    request: CanonicalRequest,
    disposeOperationGuard: () => void,
  ): PreparedDispatch {
    const runner = this.#runners.get(request.channel);
    const logOptions: ChannelRequestLogOptions<unknown, unknown> = runner
      ? runner.logOptions
      : {
          describeRequest: () => ({ channel: request.channel }),
          describeResponse: (response) => response,
        };
    let invoked = false;
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      disposeOperationGuard();
    };

    return {
      request,
      logOptions,
      async invoke(): Promise<CanonicalResponse> {
        if (disposed) {
          return {
            ok: false,
            error: {
              code: "disposed",
              message: "Prepared dispatch is disposed",
            },
          };
        }
        if (invoked) {
          return {
            ok: false,
            error: {
              code: "already_invoked",
              message: "Prepared dispatch was already invoked",
            },
          };
        }
        invoked = true;
        try {
          if (!runner) {
            return {
              ok: false,
              error: {
                code: "unknown_channel",
                message: `Unknown channel ${request.channel}`,
              },
            };
          }
          return {
            ok: true,
            value: await runner.run(context, request.payload),
          };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "handler_error",
              message: error instanceof Error ? error.message : String(error),
            },
          };
        } finally {
          dispose();
        }
      },
      [Symbol.dispose]: dispose,
    };
  }
}

/** Register feature-owned channel groups as one rollback-safe lifetime. */
export function registerChannelContributions(
  registry: ChannelRegistry,
  featureId: string,
  contributions: readonly ChannelContribution[],
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
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
  } catch (error) {
    bag[Symbol.dispose]();
    throw error;
  }
}

/** Mint a typed event publisher restricted to one feature namespace. */
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
