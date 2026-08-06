---
summary: "Source trees expose ownership and dependency direction through responsibility-named files, deliberate entrypoints, explicit composition, and nearest-owner sharing."
kind: reference
read_when: "Read before adding or moving source directories, introducing an index or barrel, extracting shared code, or reorganizing an implementation tree."
---

# Source organization

The [source-organization.directory-ownership](./rules/source-organization.directory-ownership.md) and [source-organization.file-responsibility](./rules/source-organization.file-responsibility.md) rules state the ownership invariants. This file explains the tests and patterns that apply them.

## Directories express ownership

Introduce a directory when one concept groups multiple production files or child ownership boundaries. A colocated test does not by itself justify a directory. When a directory contains one production file and only its tests, move that file and its tests to the parent.

Do not create empty, single-file, or symmetric directory layers merely to make unrelated parts of the tree look alike. Split a large responsibility into several files when the code has real internal ownership boundaries, not to justify a directory.

## Files express responsibility

Two tests decide whether a file's responsibility is clean.

**Expressibility test:** One sentence of at most 30 words must state the file's whole high-level responsibility. If it takes two sentences, the file has two responsibilities. Split it so each half fits one sentence.

**Coupling test:** Two files that are always read or edited together are one responsibility expressed as two. Merge them. Responsibilities change independently, so a change that always touches both files means they are not two responsibilities.

File length is not a criterion. A file may hold one function plus its type, or a whole pipeline, as long as the single sentence still states the responsibility. Splitting for length alone manufactures boundaries.

**Sibling separation:** Reading a directory's file summaries together, it must be clear when to read each file. Overlapping summaries mean blurred boundaries: the files share one responsibility (merge them), or the summaries were not separated (resummarize). The directory `AGENTS.md` overview states the group responsibility, what the files accomplish together. The index entries show the division of labor. Do not restate each file's summary in the overview.

## Same-name pairs identify one primary unit

A directory and source file may share a name when several production owners form the support bundle for one primary unit:

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

Use `index.ts` only when a directory intentionally presents one entrypoint or public facade. A facade exposes a smaller, deliberate API. It does not mechanically re-export every descendant.

Do not add a barrel solely to shorten import paths. Within an ownership boundary, import the source module that owns the symbol. Import through a facade when crossing the boundary that facade intentionally represents.

## Composition sits above implementations

A composition module explicitly imports, orders, selects, or wires concrete implementations. Implementations do not enroll themselves through import side effects.

Place composition at the nearest common owner of the parts it composes. Name the composition file for the result or role it assembles rather than hiding it behind an internal `index.ts`.

## Shared code moves to the nearest common owner

Keep implementation private until another real consumer needs it. When code becomes shared, move it only as high as necessary for its actual owners.

Do not create repository-wide shared areas for speculative reuse. A few additional path segments are cheaper than unclear ownership or dependencies on an overly broad common layer.

## Verification follows ownership

Keep tests, fixtures, and other verification assets beside the source unit or ownership boundary they verify. Use a separate cross-system location only when the verification genuinely has no single source owner.
