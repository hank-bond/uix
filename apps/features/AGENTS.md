---
summary: "Reusable app-layer feature implementations such as Chat, Canvas, and workspace tools, manifest-selected rather than globally discovered."
read_when: "Writing or reusing an app feature implementation, or deciding a feature belongs in the substrate."
status: stub
---

# App features

Empty until H6 moves the reusable Chat, Canvas, workspace-tools, and other app-layer feature implementations out of `src/features`. Each entry remains an ordinary feature selected by explicit manifest reference; there is no global feature discovery. Feature implementations import `@uix/api` and injected context only, never runtime or host internals.
