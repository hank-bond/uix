import type {
  ActionContribution,
  ActionDescriptor,
  ActionLeafContribution,
  ActionRun,
} from "@uix/api/actions";
import { isIdToken } from "@uix/api/contribution-id";

const ActionIdBrand: unique symbol = Symbol("ActionId");

type ActionId = string & {
  readonly [ActionIdBrand]: true;
};

export interface ActionRegistration {
  readonly id: ActionId;
  readonly descriptor: ActionDescriptor;
  readonly defaultBinding?: string;
  readonly run: ActionRun;
}

interface NormalizedActions {
  readonly descriptors: readonly ActionDescriptor[];
  readonly registrations: readonly ActionRegistration[];
}

export function toActionId(owner: string, path: readonly string[]): ActionId {
  assertActionToken("feature id", owner);
  if (path.length === 0) {
    throw new Error("An action id requires at least one local name.");
  }
  for (const name of path) {
    assertActionToken("action name", name);
  }
  return [owner, ...path].join(".") as ActionId;
}

export function normalizeActionContribution(
  owner: string,
  contribution: ActionContribution,
): NormalizedActions {
  assertActionToken("feature id", owner);
  const registrations: ActionRegistration[] = [];

  normalizeContribution(owner, contribution, [], [], registrations);
  return {
    descriptors: registrations.map(({ descriptor }) => descriptor),
    registrations,
  };
}

function normalizeContribution(
  owner: string,
  contribution: ActionContribution,
  namePath: readonly string[],
  titlePath: readonly string[],
  registrations: ActionRegistration[],
): void {
  for (const [name, node] of Object.entries(contribution)) {
    assertActionToken("action name", name);
    assertTitle(node.title);

    if ("children" in node) {
      normalizeContribution(
        owner,
        node.children,
        [...namePath, name],
        [...titlePath, node.title],
        registrations,
      );
      continue;
    }

    registrations.push(normalizeAction(owner, name, node, namePath, titlePath));
  }
}

function normalizeAction(
  owner: string,
  name: string,
  contribution: ActionLeafContribution,
  namePath: readonly string[],
  titlePath: readonly string[],
): ActionRegistration {
  const id = toActionId(owner, [...namePath, name]);
  const descriptor: ActionDescriptor = {
    id,
    owner,
    title: contribution.title,
    path: [...titlePath, contribution.title],
    ...(contribution.description !== undefined
      ? { description: contribution.description }
      : {}),
    enabled: contribution.enabled ?? true,
    running: false,
    conflictsWith: [],
  };

  return {
    id,
    descriptor,
    ...(contribution.defaultBinding !== undefined
      ? { defaultBinding: contribution.defaultBinding }
      : {}),
    run: contribution.run,
  };
}

function assertActionToken(label: string, token: string): void {
  if (!isIdToken(token)) {
    throw new Error(
      `Invalid ${label}: ${token}. Expected a lowercase id token.`,
    );
  }
}

function assertTitle(title: string): void {
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Action and group titles must not be empty.");
  }
}
