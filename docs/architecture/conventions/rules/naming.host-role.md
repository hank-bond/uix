---
summary: "Name host-owned symbols and files by semantic responsibility, consistently across hosts where purpose and scope match."
kind: reference
---

# Name host responsibilities consistently

**Rule: must.** Name host-owned symbols and files by semantic responsibility, consistently across hosts where purpose and scope match.

**Scope:** UIX-owned names within concrete hosts, including types, functions, methods, and file basenames.

**Approved example:** Use the class name `AttachmentWebBindingState` for the same binding-state responsibility in each host. The owning directory identifies the host. Retain the Electron type name `IpcRendererEvent` because it represents a platform-specific event. Include `WebSocket` in a name when the responsibility depends on that protocol.

**Nonconforming example:** Name equivalent classes `ElectronAttachmentWebBindingState` and `ServerAttachmentWebBindingState` solely to repeat directory ownership. Giving a bootstrap read over inter-process communication (IPC) and a WebSocket admission message identical names also violates the rule when their scopes differ.

**Reason:** Matching names help readers compare equivalent responsibilities across hosts. Platform qualifiers distinguish dependencies that affect behavior from directory ownership. Different names preserve differences in purpose or scope.

**Enforcement:** Review corresponding host responsibilities by purpose and scope, not by implementation similarity or a mechanical prefix-removal rule.
