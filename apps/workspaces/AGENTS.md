---
summary: "Explicit workspace compositions: repository dogfood and product manifests with optional local feature source beside them."
read_when: "Composing a workspace manifest or a product composition."
status: stub
---

# Workspaces

Empty until H6 moves the repository dogfood manifest and any workspace-specific source under `apps/workspaces/default`. A workspace composition is a `uix.workspace.json` plus optional local features; manifests reference shared features explicitly and never rely on discovery. The core runtime and hosts build without importing this tree.
