// Host-neutral capabilities consumed by the launcher client.

/** One host-known workspace projected for launcher presentation. */
export interface LauncherWorkspace {
  /** Opaque host-level workspace identity. */
  readonly id: string;
  readonly name: string;
  /** Optional human-readable context, such as a local manifest path. */
  readonly description?: string;
}

/** A launcher transition either transfers ownership or leaves the page live. */
export type LauncherActionOutcome = "accepted" | "canceled";

/** Host operations available to the shared pre-workspace launcher. */
export interface LauncherAdapter {
  readonly listWorkspaces: () => Promise<readonly LauncherWorkspace[]>;
  readonly openWorkspace: (
    workspaceId: string,
  ) => Promise<LauncherActionOutcome>;
  /** Absent when the host exposes a read-only workspace catalog. */
  readonly createWorkspace?: (request: {
    readonly name: string;
  }) => Promise<LauncherActionOutcome>;
}
