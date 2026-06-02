---
summary: "Why TypeBox is used for every substrate schema surface instead of splitting with Zod. Read when adding schemas for IPC, channels, config, or on-disk data."
status: accepted
---

# TypeBox everywhere, not split with Zod

The earlier framing was TypeBox at the agent/channel boundary, Zod everywhere else (forms, IPC, on-disk). Rejected:

- **Two schema libraries** means every author asks "which one here?" — the accidental complexity the design principles resist.
- **Zod's wins** (nicer ergonomics, friendlier default errors, richer transforms) are real but small; a tiny error-formatting wrapper once removes most of the gap.
- **Form-layer validation** — the strongest Zod case — lives in extensions, not the substrate. Extensions pick their own validator for internal state.
- **`TypeCompiler`** gives AOT-compiled validators that beat Zod on hot paths, and channel-message validation is a hot path.

Substrate surfaces (channels, IPC, contribution manifests, pi tool schemas, on-disk schemas the substrate defines) are TypeBox. `$schema`-tagged configs stay human-editable. An extension wanting Zod for its internal state is fine.
