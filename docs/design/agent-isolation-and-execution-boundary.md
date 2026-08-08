---
summary: "Exploring agent execution isolation: a per-agent VM as the bash execution boundary with the workspace mounted as a host volume, UIX-owned network/location/secrets policy encoded into VM policy, and hardware isolation for tool execution — while agent-in-VM, VM fs-signals, and VM snapshot file rollback are rejected paths with stated revisit triggers."
kind: explanation
status: exploring
---

# Agent isolation and the execution boundary

## Current synthesis

The minimal commitment is a per-agent persistent VM for bash only: the agent process and Pi stay host-side; the workspace is a host volume mounted into the VM; the `command` tool override delegates to an interactive streaming exec in the guest. Guardrail value: bash no longer runs on the host, network is off by default, secrets stay out of the guest, and the VM is kill-safe.

UIX owns the policy: approved network egress, approved locations, and secrets. For `command` it is encoded into VM policy (per-host egress allowlist, volume mounts, `--secret-env`/SSH-agent forwarding). The same policy wraps `read`/`write`/`edit` host-side rather than converting those tools into VM calls — files stay host-authoritative.

The host volume mount is also the file-change bridge: guest writes land on host files, so the host watcher sees them; the VM never needs to signal file changes. Execution VM adoption is opt-in per workspace with a local-spawn fallback.

smolvm findings that shape the boundary: microVMs over HVF/KVM/WHP with sub-second cold start; network off by default with per-host egress allowlists; volumes via virtiofs; stdio in both buffered and interactive-streaming modes (timeout → kill → exit 124); persistent overlays for cross-call guest state; `machine fork` (macOS/Linux) freezes a golden and boots warm clones; FsNotify plumbing is host → guest only (for guest hot-reload), not guest → host.

## Rejected paths and revisit triggers

- **Agent-in-VM** — deferred, not rejected: requires a Pi-compatible runtime in the guest plus a host control plane, which is the multi-runtime/concurrency project. Revisit when concurrent or ephemeral agents become the goal; fork-from-prepared-golden (Pi installed) is then the mechanism.
- **Guest-to-host fs-signals** — rejected: smolvm has no such channel (its fsnotify runs the other way), and the host volume mount makes it unnecessary. Revisit only if the workspace ever lives in VM disk, which itself is gated on host authority changing.
- **VM snapshot/checkpoint for workspace-file rollback** — rejected: snapshots capture VM memory and disk layers, not host-mounted volumes; in a VM-disk design the change tracking relocates into the sync-back layer rather than disappearing. Revisit only for disposable workloads ("the whole VM is the checkpoint" for ephemeral one-shots).
- **Tools-in-VM for read/write/edit** — rejected: files stay host-authoritative and host-side policy wrapping is simpler. Revisit only if the workspace moves into VM disk.

## Open axes

- Whether the bash VM is part of the first build or a follow-up; how it defaults (opt-in per workspace, local-spawn fallback).
- `machine fork` semantics on Windows (not available) and exec streaming behavior under load.
- virtiofs cache consistency when the same directory is written host-side and guest-side concurrently.
- Later: VM snapshots as a fourth rollback authority for _environment_ state (installed packages, /tmp, background processes) that file checkpoints never capture.

Related: [session worktrees and turn checkpoints](../decisions/2026-08-08-session-worktrees-and-turn-checkpoints.md), [host file-watcher primitive](../decisions/2026-08-08-host-file-watcher-primitive.md).
