---
summary: "Do not reference plans, plan units, or the timing of future work in code, comments, or non-plan documentation."
kind: reference
---

# Reference plans only where plans live

**Rule: must.** Code, comments, and non-plan documentation do not reference plans, plan units, or the timing of future work.

**Scope:** Source files, comments, package metadata, `AGENTS.md` files, and documentation outside `plans/`, `decisions/`, and `design/`. Navigation that routes readers to the plans tree points at plans without making plan content authoritative for a document's claims. Generated indexes and the documentation model count as navigation.

**Approved example:** A comment states current behavior only, such as `The runtime keeps the selected-session singleton semantics the driver already provides`. A stub states its purpose in the present, such as `Empty. Owns the Electron composition and adapters`.

**Nonconforming example:** A comment names a plan unit, such as `H3 singleton semantics`. A stub says `Empty until H7 reconstitutes the host`. A code comment notes `a later unit replaces the singleton`.

**Reason:** Plans schedule point-in-time work. Code and living documentation describe HEAD, and their claims must stay valid as the plan advances. A plan unit lands or changes and every citation revalidates or goes stale. A note that code or docs await future change, hold a temporary state, or expect rework belongs in the plan that schedules the work.

**Exceptions:** Decision records may reference plans as a whole for attribution, and design threads may reference plans as a whole. Documents that track the current state of active work, such as the architecture build map and open questions, may reference plans. A comment link to a living convention remains allowed.

**Enforcement:** Review. The structural checks and vale cannot distinguish plan citation from navigation to the plans tree.
