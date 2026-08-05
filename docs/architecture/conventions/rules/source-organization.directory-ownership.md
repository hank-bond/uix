---
summary: "A directory groups source owned by one coherent domain or implementation unit and does not itself define a module or public API."
kind: reference
---

# Directories express ownership

**Rule: must.** A directory groups source owned by one coherent domain or implementation unit. A directory does not automatically define a module, namespace, or public API. Introduce a directory when one concept groups multiple production files or child ownership boundaries.

**Approved example:** `src/main/agent/` grouping the driver, installers, and transcript projection that one subsystem owns.

**Nonconforming example:** A directory containing one production file and only its tests. Also an empty or single-file directory layer that merely makes unrelated parts of the tree look alike.

**Reason:** The source tree is a dependency map. Its paths let a reader infer what owns a unit, where composition occurs, and whether an import crosses a deliberate boundary.

**Exceptions:** A colocated test does not by itself justify a directory. When a directory contains one production file and only its tests, move that file and its tests to the parent.
