import type {
  ActionCatalogEntry,
  ActionContribution,
  ActionLeafContribution,
  ActionRun,
  ActionId,
} from "@uix/api/actions";
import { isIdToken } from "@uix/api/contribution-id";
import { normalizeShortcut, type Shortcut } from "@uix/api/shortcuts";

export interface ActionRegistration {
  readonly id: ActionId;
  readonly catalogEntry: ActionCatalogEntry;
  readonly run: ActionRun;
}

export type ActionDefaultBindingMap = Readonly<Record<ActionId, Shortcut>>;

interface NormalizedActions {
  readonly catalogEntries: readonly ActionCatalogEntry[];
  readonly registrations: readonly ActionRegistration[];
  readonly defaultBindings: ActionDefaultBindingMap;
}

export function toActionId(owner: string, path: readonly string[]): ActionId {
  assertActionToken("feature id", owner);
  if (path.length === 0) {
    throw new Error("An action id requires at least one local name.");
  }
  for (const name of path) {
    assertActionToken("action name", name);
  }
  return [owner, ...path].join(".");
}

export function normalizeActionContribution(
  owner: string,
  contribution: ActionContribution,
): NormalizedActions {
  assertActionToken("feature id", owner);
  const registrations: ActionRegistration[] = [];
  const defaultBindings: Record<ActionId, Shortcut> = {};

  normalizeContribution(
    owner,
    contribution,
    [],
    [],
    registrations,
    defaultBindings,
  );
  return {
    catalogEntries: registrations.map(({ catalogEntry }) => catalogEntry),
    registrations,
    defaultBindings,
  };
}

function normalizeContribution(
  owner: string,
  contribution: ActionContribution,
  namePath: readonly string[],
  titlePath: readonly string[],
  registrations: ActionRegistration[],
  defaultBindings: Record<ActionId, Shortcut>,
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
        defaultBindings,
      );
      continue;
    }

    registrations.push(
      normalizeAction(owner, name, node, namePath, titlePath, defaultBindings),
    );
  }
}

function normalizeAction(
  owner: string,
  name: string,
  contribution: ActionLeafContribution,
  namePath: readonly string[],
  titlePath: readonly string[],
  defaultBindings: Record<ActionId, Shortcut>,
): ActionRegistration {
  const id = toActionId(owner, [...namePath, name]);
  const catalogEntry: ActionCatalogEntry = {
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

  if (contribution.defaultBinding !== undefined) {
    defaultBindings[id] = normalizeShortcut(contribution.defaultBinding);
  }

  return {
    id,
    catalogEntry,
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
