---
summary: "Design principles that guide planning and review — the rules we reach for when deciding how to shape a feature or API."
status: active
---

# Design principles

Living list of load-bearing design rules. Add entries as they emerge from threads; cite them in decisions and plans.

## Make the right thing the only thing

When a feature needs to do something and there's only one correct way to do it, the substrate should do it for the feature. Pre-bind, pre-validate, or derive at the boundary rather than handing the feature raw primitives it has to assemble correctly. Every decision and implementation detail a feature author must remember is an opportunity to get it wrong.
