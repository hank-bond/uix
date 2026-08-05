---
summary: "Preserve equivalent meaning and operation across visual, keyboard, and accessibility-tree presentations."
kind: reference
---

# Preserve equivalent meaning and operation

**Rule: must.** Preserve equivalent meaning and operation across visual, keyboard, and accessibility-tree presentations. Prefer browser standards and semantic HTML. Use ARIA only to fill a semantic gap.

**Approved example:** Use a native `button` with visible text instead of a clickable `div` with an `aria-label`.

**Nonconforming example:** Make a control reachable only by pointer, or convey its meaning with color alone.

**Reason:** Native elements bring keyboard, focus, and modal semantics for free. ARIA fills only the exact missing semantic.
