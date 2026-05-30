# trellis-core

First-party Trellis package. Pi-only — contributes to the agent side
(system prompt + tools) but has no cockpit UI of its own.

This is the canonical example of a **pi-only Trellis package**: a
Trellis-loadable package whose `package.json` declares a `pi` field but
no `trellis` field. The substrate loader discovers it and forwards its
pi contributions to pi's extension system; the cockpit UI itself is
unaffected.

Status: skeleton. Content lands with milestone 4. See
[../../../TRELLIS.md](../../../TRELLIS.md#near-term-milestones).
