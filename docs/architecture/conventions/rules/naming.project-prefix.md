---
summary: "Do not prefix a project-owned name with the project name."
kind: reference
---

# Prefix only shared namespaces with the project name

**Rule: must.** Do not prefix a project-owned name with the project name.

**Scope:** Names of files, directories, styles, symbols, channels, attributes, and other artifacts authored in this repository.

**Approved example:** Vale styles named `grammar`, `lexicon`, and `comments`. The substrate channel contract symbol is `substrateChannels`.

**Nonconforming example:** `uix-grammar`, `uixChannels`, and feature-owned DOM markers such as `data-uix-part`.

**Reason:** The repository, package, or owning feature is already the name's namespace, so the project name adds no meaning. Every project-prefixed name is one more mention that a project rename must chase down.

**Exceptions:** A shared namespace where the project's system components must be distinguishable from contributed or external components earns a reserved discrete prefix. The prefix is reserved for markers the system owns in markup, streams, or catalogs it does not fully control. Current reserved namespaces:

- Substrate IPC channel names (`uix:reload`) and the reserved `uix` channel id on the transport bus shared with feature channels.
- The resource transport's origin class: the `uix-resource://` scheme and the `uix.local` substrate origin, which the page CSP and permission logic reference by identity.
- The surface-root marker `data-uix-surface`, which the host sets on every contributed surface for style scoping.
- The `<uix-state>` agent-context envelope, a reserved marker in the agent-facing state stream.
- Owned artifacts that must be discoverable among a user's own files: the workspace manifest (`uix.workspace.json`) and state directory (`.uix/`).
- The `@uix/*` package scope in the shared npm registry namespace.

Feature-authored markers in content use their feature's name instead of the project prefix (`data-canvas-prompt`, `canvas:writeback`). Contributed-feature internal DOM uses plain names (`data-part`).

**Enforcement:** Introduce or rename artifacts with plain project-owned names. Review greps for the project name as a prefix against this list when a new prefixed name appears.
