---
summary: "Name host-owned symbols and files by semantic responsibility, consistently across hosts where purpose and scope match."
kind: reference
---

# Name host responsibilities consistently

**Rule: must.** Name host-owned symbols and files by semantic responsibility, consistently across hosts where purpose and scope match.

**Scope:** UIX-owned names within concrete hosts, including types, functions, methods, and file basenames.

**Approved example:** Use `AttachmentWebBindingState` for the same binding-state responsibility in each host. The owning directory identifies the implementation. Use platform vocabulary such as `IpcRendererEvent` when the name directly represents an Electron-specific concept. Preserve `WebSocket` in a name when that transport defines its responsibility.

**Nonconforming example:** Use `ElectronAttachmentWebBindingState` and `ServerAttachmentWebBindingState` solely to repeat directory ownership. Conversely, do not give an IPC bootstrap read and a WebSocket admission message identical names when their scopes differ.

**Reason:** Matching names make equivalent host responsibilities comparable. Platform qualifiers identify genuine platform dependencies rather than host ownership. Meaningful differences remain visible instead of disappearing behind forced symmetry.

**Enforcement:** Review corresponding host responsibilities by purpose and scope, not by implementation similarity or a mechanical prefix-removal rule.
