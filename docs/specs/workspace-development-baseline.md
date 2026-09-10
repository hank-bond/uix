---
summary: "UIX provides an optional development baseline that guides app builders and agents from understandable requirements to reviewed code and tests."
kind: reference
status: draft
implementation: incomplete
---

# Workspace development baseline

## Contract

UIX provides a small, optional starting process for building apps with an agent. The baseline provides editable project guidance, specification and plan templates, and shared documentation checks. An agent can find the process from the repository's root `AGENTS.md` without the author assembling instructions or configuring the checks themselves.

The initial audience can describe an app and check its behavior but need not understand programming or repository tooling. The agent guides the author through deciding and reviewing requirements. Those requirements guide the agent's plans, code, and tests.

The baseline is a starting point, not a restriction on how UIX projects develop. Authors can change or remove it, or start with a blank repository.

## Dependencies

The baseline adapts the lifecycle in [`requirement-specifications.md`](../contributing/requirement-specifications.md) for app builders. It uses the documentation practices in [`routing-and-indexes.md`](../contributing/routing-and-indexes.md), [`frontmatter.md`](../contributing/frontmatter.md), and [`comments.md`](../architecture/conventions/comments.md).

These documents govern the extraction of the baseline. The resulting project guidance must stand on its own without requiring an author or agent to browse UIX's implementation repository. The vocabulary workflow adapts the [controlled lexicon practice](../architecture/conventions/contributing.md#controlled-lexicon), not UIX's concrete term definitions.

## Boundary

This specification owns the development guidance and reusable checks offered to new projects. The guidance includes project orientation, specification and plan authoring, review boundaries, document discovery, and a small place to develop the project's vocabulary.

The baseline supports repositories with multiple app workspaces, each with its own content and configuration. It does not require per-Agent worktrees, sparse checkout, or execution sandboxing.

The first scope excludes:

- A project-creation wizard, repository provisioning, or an existing-project onboarding flow.
- Separate guidance profiles for different experience levels.
- Automatic enforcement of agent behavior, specification acceptance, or review approvals.
- Host distribution or feature execution behavior.

## Requirements

### Guided development

- The baseline **must** explain the process in words an author can use without knowing how the app is implemented.
- The guidance **must** direct the agent to ask about intended behavior, constraints, and examples before proposing implementation work.
- The guidance **must** leave scope decisions and requirement acceptance with the author. An unanswered question or unaccepted agent proposal **must not** be presented as an agreed requirement.
- The guidance **must** distinguish discussion from permission to implement. It **must** direct the agent to ask when requirements are unclear.
- The guidance **must** help the agent express requirements as actions, visible results, data rules, and failure behavior that the author can review.
- The guidance **must not** require the author to choose private types, algorithms, dependencies, or file layouts to approve ordinary feature behavior.
- Technical detail **may** appear when it changes the agreed behavior or when the author wants to make that choice.
- The guidance **must** allow explicitly approved experiments before specification acceptance. Their findings inform the specification rather than establish requirements by themselves.

These are obligations on the provided guidance, not guarantees that every model follows it. The baseline does not introduce a separate agent controller.

### Specifications, plans, and evidence

- The baseline **must** provide starting templates for a feature specification and an implementation plan. Templates **must** distinguish instructions and examples from requirements already accepted by the author.
- The specification template **must** cover purpose, scope, dependencies, behavior, conformance outcomes, and unresolved questions. Sections without useful content **may** be omitted.
- The guidance **must** preserve the distinction between accepting requirements and completing their implementation, using the specification lifecycle defined by its dependency.
- The guidance **must** place implementation steps, mechanisms, temporary findings, and progress in plans rather than specifications.
- The guidance **must** direct the agent to derive code and tests from the accepted specification. Tests **must not** be described as sufficient evidence merely because they reproduce the implementation's behavior.
- The guidance **must** pair technical checks with outcomes the author can inspect, where the feature has observable behavior.
- The guidance **must** divide implementation into reviewable steps and require review at the agreed boundaries. Passing checks **must not** be presented as author approval or permission to commit.
- The guidance **must** return material requirement changes to specification review. It **must** preserve durable findings before replacing an implementation attempt and its plan.
- The guidance **must** distinguish deferred ideas from requirements of the first release. It **must not** require a specification for every helper or source file.

For example, an import feature can require that the source file remains unchanged. The author reviews that promise and the resulting import behavior. The agent provides a test comparing source bytes, without asking the author to choose a copying algorithm.

### Project guidance routes

- The baseline **must** provide a root `AGENTS.md` that explains project ownership and routes to the development process and relevant child guidance.
- The baseline **must** include enough local guidance for a fresh agent to identify the specification, active plan, and review rules for its task.
- The guidance **must** keep app specifications, plans, code, and tests with their app or feature owner. Shared repository guidance **must not** duplicate each workspace's records.
- The baseline **must** support a repository containing several app workspaces, including specifications and plans nested within them.
- The baseline **must** use document frontmatter summaries and production source summaries to generate `AGENTS.md` indexes. Each parent **must** route through immediate child owners rather than flatten their descendants.
- Generated indexes **must** remain separate from handwritten guidance. Regeneration **must** preserve content outside the generated markers.
- The baseline **must** explain how agents find guidance on demand. It **must not** require loading the entire documentation tree for each task.
- Initial guidance **must** be small enough to orient the agent without copying UIX's complete convention library or creating empty documentation hierarchies.

### Plain technical writing

- The baseline **must** guide agents to use plain words, focused sentences, active voice where the actor matters, and consistent names for the same concepts.
- The guidance **must** keep requirements distinguishable from explanations, examples, and unresolved questions.
- Sentence-length checks, when provided, **must** be advisory rather than blocking. They **must** exclude code, historical quotations, and generated indexes.
- Active voice, clarity, and semantic consistency **must** remain review judgments rather than automatic pass-or-fail tests.
- The baseline **must not** adopt UIX's retired-word lists or blanket punctuation bans as project defaults.

### Project vocabulary

- The baseline **must** provide a small, editable vocabulary starting point and route agents to it from project guidance.
- The template **must** support a preferred term, its meaning and scope, its distinction from nearby terms, and examples of appropriate and misleading use.
- The baseline **must** include one or two illustrative entries. Examples **must** be clearly separate from agreed project definitions and **must not** activate term restrictions.
- The guidance **must** direct the agent to notice recurring concepts, multiple names for one concept, and one name used for different concepts. It **must** bring unclear distinctions to the author rather than silently decide their meaning.
- The guidance **must** direct the agent to record agreed meanings and reuse their terms consistently in specifications, active documentation, and relevant code names. Definitions **must** describe concepts rather than depend on a particular implementation.
- The guidance **must** direct the agent to consult existing definitions before introducing competing terms and revisit definitions when the author's understanding changes.
- Adopting a term **must not** authorize an unrelated repository-wide rename. The guidance **must** keep changes within the agreed scope and preserve historical wording.
- The starting point **must not** require separate vocabulary taxonomies or an inventory of every identifier. Add definitions when they settle a real recurring distinction.
- Projects **may** add scoped checks for agreed vocabulary rules that can be checked reliably. Whether a word expresses the intended concept remains a review judgment.

For illustration, a task-tracking app might distinguish a _task_, the work requested, from an _attempt_, one try at completing it. A retry creates another attempt at the same task, not another task. These example meanings demonstrate how a definition resolves an ambiguity. They are not vocabulary requirements for adopting projects.

### Shared checks

- UIX and adopting projects **must** consume one shared implementation of the index generator and applicable lint rules rather than maintain separate copies.
- Each repository **must** be able to configure its authored documentation and source scope without changing the shared tooling.
- Applying the baseline **must** provide working check configuration and documented commands. The author **must not** need to design a lint configuration before using the process.
- The checks **must** cover required document metadata, specification lifecycle fields, document shape, relative links, source-summary format, generated-index freshness, and formatting.
- Shared summary checks **must** enforce the applicable documented summary forms. Summary usefulness, responsibility boundaries, and whether language is understandable remain review judgments.
- A failed check **must** identify the affected file and the violated rule. A check-only operation **must not** rewrite files or alter Git staging state.
- The tooling **must** distinguish authored content from imported histories, generated artifacts, dependencies, and other data. Git tracking alone **must not** make content subject to authoring rules.
- The shared checks **must not** impose UIX host-internal conventions on app features. The baseline's applicable prose rules **must** be documented separately from UIX-specific vocabulary.
- The baseline **must** provide a combined local verification path for its required checks. Hosted continuous integration and Git-hook installation are not required by this specification.

### Author ownership and optional adoption

- Baseline guidance, templates, and project configuration **must** be editable by the adopting project. Their continued behavior **must not** depend on hidden instructions tied to the UIX development checkout.
- Projects **must** be able to retain, modify, or remove individual parts of the baseline, including disabling its checks.
- UIX **must not** require baseline documents or passing authoring checks merely to open or use a workspace.
- A shared-tooling update **must not** silently rewrite project-owned guidance or restore content the author removed.
- Applying or refreshing baseline content **must not** silently replace existing authored files.
- Project dependencies **must** record which shared tooling they consume so another checkout can obtain the same tooling.

## Conformance

A conforming implementation demonstrates these outcomes:

1. A fresh external project receives the baseline and can generate and validate its indexes without access to a developer's UIX source checkout.
2. A fresh agent can follow the root guidance to draft a feature specification from a plain-language request. A review exercise shows explicit author decisions and checkable outcomes, not assumed approval or required implementation knowledge.
3. The provided templates and guidance lead from an accepted specification to a linked plan, reviewed implementation steps, and tests against the agreed behavior. Acceptance and implementation completion remain distinct.
4. Two app workspaces in one repository retain their own specifications and plans. Root and child indexes expose the correct owners without copying complete descendant indexes into the root.
5. Editing a document summary or production source summary makes verification fail on the stale index. Regeneration updates that entry while preserving handwritten guidance.
6. Missing required metadata, invalid specification states, broken relative links, malformed source summaries, and formatting failures produce actionable errors. Accepted specifications with unresolved questions fail verification.
7. Imported histories and generated artifacts remain outside authoring checks, even when tracked by Git. Equivalent errors in declared authored content still fail.
8. UIX and an adopting repository execute the shared checks through repository-specific configuration. Neither repository maintains a fork of the generator or shared lint rules.
9. Authors can edit or remove the guidance and checks, or use a blank repository, without losing the ability to use their UIX workspace. Dependency updates do not restore removed guidance.
10. Check-only commands leave files and Git staging unchanged. Applying baseline content to a destination with authored files does not silently overwrite them.
11. The baseline includes concise writing guidance without UIX-specific word bans. Any sentence-length feedback is advisory and leaves excluded content untouched.
12. A fresh agent can find the vocabulary template and distinguish its illustrative entries from agreed project terms. A review exercise introduces ambiguous or competing names, records the author's chosen meaning, and applies that term consistently within the agreed scope.

## Degrees of freedom

The implementation may choose package names, distribution mechanisms, command names, and the configuration format for authored roots. Templates may be applied manually or through a command. A project-creation interface is not required.

Guidance and templates may share a document when that reduces duplication. The baseline does not require a particular number of files, a feature implementation framework, or a test runner.
