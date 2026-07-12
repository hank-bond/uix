export type ActionRun = () => void | Promise<void>;

export interface ActionLeafContribution {
  readonly title: string;
  readonly description?: string;
  readonly defaultBinding?: string;
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

export interface ActionDescriptor {
  readonly id: string;
  readonly owner: string;
  readonly title: string;
  /** Group titles followed by this action's title. */
  readonly path: readonly string[];
  readonly description?: string;
  readonly binding?: string | null;
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
