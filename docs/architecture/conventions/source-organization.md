---
summary: "Source trees expose ownership and dependency direction through responsibility-named files, deliberate entrypoints, explicit composition, and nearest-owner sharing."
kind: reference
read_when: "Read before adding or moving source directories, introducing an index or barrel, extracting shared code, or reorganizing an implementation tree."
status: active
---

# Source organization

The source tree is a dependency map, not a taxonomy for its own sake. Its paths should let a reader infer what owns a unit, where composition occurs, and whether an import crosses a deliberate boundary.

## Directories express ownership

**Rule:** A directory groups source owned by one coherent domain or implementation unit. A directory does not automatically define a module, namespace, or public API.

Introduce a directory when one concept groups multiple production files or child ownership boundaries. A colocated test does not by itself justify a directory. When a directory contains one production file and only its tests, move that file and its tests to the parent.

Do not create empty, single-file, or symmetric directory layers merely to make unrelated parts of the tree look alike. Split a large responsibility into several files when the code has real internal ownership boundaries, not to justify a directory.

## Files express responsibility

**Rule:** Name a source file after the stable responsibility it implements. Keep declarations beside the behavior that gives them meaning.

Avoid miscellaneous containers such as `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`, or `types.ts`. When a file accumulates unrelated responsibilities, split it by those responsibilities rather than moving the mixture behind a broader name.

## Same-name pairs identify one primary unit

**Rule:** A directory and source file may share a name when several production owners form the support bundle for one primary unit:

```text
parser/
  parser.ts
  token-stream.ts
  parser.test.ts
  token-stream.test.ts
```

Do not create the directory when the primary file and its test would be its only source units. Keep `parser.ts` and `parser.test.ts` together in the parent instead.

Do not add a same-name file as a catch-all inside a category directory:

```text
parsing/parsing.ts
formatters/formatters.ts
```

Name each category member for the responsibility it owns.

## Entrypoints are deliberate boundaries

**Rule:** Use `index.ts` only when a directory intentionally presents one entrypoint or public facade. A facade exposes a smaller, deliberate API; it does not mechanically re-export every descendant.

Do not add a barrel solely to shorten import paths. Within an ownership boundary, import the source module that owns the symbol. Import through a facade when crossing the boundary that facade intentionally represents.

## Composition sits above implementations

**Rule:** A composition module explicitly imports, orders, selects, or wires concrete implementations. Implementations do not enroll themselves through import side effects.

Place composition at the nearest common owner of the parts it composes. Name the composition file for the result or role it assembles rather than hiding it behind an internal `index.ts`.

## Shared code moves to the nearest common owner

**Rule:** Keep implementation private until another real consumer needs it. When code becomes shared, move it only as high as necessary for its actual owners.

Do not create repository-wide shared areas for speculative reuse. A few additional path segments are cheaper than unclear ownership or dependencies on an overly broad common layer.

## Verification follows ownership

**Rule:** Keep tests, fixtures, and other verification assets beside the source unit or ownership boundary they verify. Use a separate cross-system location only when the verification genuinely has no single source owner.

UI component stylesheet ownership and cascade composition are defined separately in [`user-interface.md`](./user-interface.md). Export and runtime dependency rules are defined in [`module-boundaries.md`](./module-boundaries.md).
