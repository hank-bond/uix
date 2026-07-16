import { Type, type Static } from "typebox";

import { ShortcutSchema, type Shortcut } from "./shortcuts";

const actionIdTokenPattern = "[a-z][a-z0-9_-]*";

export const ActionIdSchema = Type.String({
  pattern: `^${actionIdTokenPattern}(?:\\.${actionIdTokenPattern})+$`,
});
export type ActionId = Static<typeof ActionIdSchema>;

export const KeybindingMapSchema = Type.Record(
  ActionIdSchema,
  Type.Union([ShortcutSchema, Type.Null()]),
  { additionalProperties: false },
);
export type KeybindingMap = Static<typeof KeybindingMapSchema>;

export type ActionRun = () => void | Promise<void>;

export interface ActionLeafContribution {
  readonly title: string;
  readonly description?: string;
  readonly defaultBinding?: Shortcut;
  readonly enabled?: boolean;
  readonly run: ActionRun;
}

export interface ActionGroupContribution {
  readonly title: string;
  readonly children: ActionContribution;
}

export type ActionContribution = Readonly<
  Record<string, ActionLeafContribution | ActionGroupContribution>
>;

export interface ActionContributionUpdater extends Disposable {
  update(contribution: ActionContribution): void;
}

export type RegisterActionContribution = (
  contribution: ActionContribution,
) => ActionContributionUpdater;

export interface ActionDescriptor {
  readonly id: ActionId;
  readonly owner: string;
  readonly title: string;
  /** Group titles followed by this action's title. */
  readonly path: readonly string[];
  readonly description?: string;
  readonly binding?: Shortcut | null;
  readonly enabled: boolean;
  readonly running: boolean;
  readonly conflictsWith: readonly string[];
}

export type ActionNotInvokedReason =
  | "not_found"
  | "disabled"
  | "already_running";

export type ActionInvocationResult =
  | { readonly status: "completed" }
  | {
      readonly status: "not_invoked";
      readonly reason: ActionNotInvokedReason;
    };
