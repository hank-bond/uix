---
summary: "Canvas gives each Agent a versioned HTML document that the Agent edits by anchors and the human edits through a browser."
kind: reference
status: draft
---

# Canvas artifacts

## Contract

A _Canvas artifact_ is an authored HTML document identified by one Canvas key in one Agent viewpoint. Canvas versions the document on the session branch. The Agent reads and edits it through stable line anchors, while the browser presents interactive content.

Canvas is an ordinary feature. It contributes documents, tools, model context, turn state, web routes, assets, events, a surface, and a browser shim. These use the same public feature mechanisms available to other features.

Canvas owns how the Agent reads, edits, versions, and reasons about its HTML documents. It does not define what a document means to an application. Reviews, reports, dashboards, components, hydration functions, and templates belong to Canvas content or workspace features.

## Dependencies

This specification depends on [`managed-documents.md`](./managed-documents.md) for current content, immutable versions, and conditional replacement. [`feature-turn-state.md`](./feature-turn-state.md) defines branch persistence and restoration. [`agent-bound-feature-web.md`](./agent-bound-feature-web.md) defines browser delivery. [`connection-agent-attachments.md`](./connection-agent-attachments.md) defines request and event targeting. Canvas also follows the exported channel, Agent-tool, Agent-context, resource, and feature APIs.

## Boundary

Canvas owns HTML canonicalization, its document buffer, version metadata, key addressing, browser serialization, and writeback. It also owns prompt ordering, Agent tools and guidance, its turn-state cell, and its model context.

The document store owns current content, revisions, immutable versions, atomic conditional replacement, and physical storage without interpreting HTML or anchors. Feature turn state controls when Canvas records and restores a selected version. Feature web routes deliver browser requests to the correct Canvas instance and own the attachment binding and injected base. Workspace features provide reusable assets and application-specific handlers.

## Requirements

### Identity and source of truth

- A Canvas document **must** use a validated Canvas key and a logical document identifier, never a storage path.
- Each Agent viewpoint **must** have separate mutable current Canvas content.
- Immutable document versions **may** be shared by stable identity while branch state selects versions through Canvas's turn-state cell.
- The authored HTML document is the source of truth. Browser-rendered or hydrated output is derived from it.
- Canvas storage, tools, routes, and events **must** resolve through the same Agent feature instance.

### Canonical HTML and anchored editing

- Canvas **must** canonicalize every authored document as HTML before making it the current document.
- Canonicalization **must** normalize browser-significant HTML structure without deliberately reformatting authored whitespace into a new layout style.
- Agent-facing lines **must** use assigned stable anchors rather than line numbers or content hashes.
- Agent read results **must** return current anchored lines.
- An Agent edit **must** identify its first and last lines by anchor and exact text.
- If either line no longer matches, the edit **must** fail instead of changing a different line.
- After an edit, Canvas **must** canonicalize the complete result, update its anchors, persist the authored document, and return the affected lines with current anchors.
- A whole-document Agent write replaces the complete document and **may** allocate fresh anchors.
- Anchor names are metadata and **must not** be accepted as accidentally copied authored content.

### Managed-document use

- Every successful Agent write, Agent edit, or human writeback **must** update the Canvas document's managed current content.
- Human writeback **must** include the base revision from the served document and **must** use the managed document's conditional replacement.
- The managed document store **must** decide replaced versus stale atomically. Canvas **must not** implement revision comparison itself.
- A stale human writeback **must not** change the buffer's working state. Canvas **must** keep the current document and surface the winning revision.
- Canvas **must** adopt candidate anchored state only after the store confirms a successful conditional replacement.
- Each immutable Canvas version **must** contain canonical authored HTML and enough Canvas metadata to restore the same anchors.
- Losing optional anchor metadata **may** degrade to regenerated anchors and a required Agent reread, but it **must not** corrupt document content.
- Immutable versions become selected branch state only when Canvas's turn-state cell references them.
- Canvas need not select a new turn-state version after every browser input event or Agent tool call.

### Browser document transport

- Canvas document bytes **must** use Agent-bound feature web routes instead of channel request payloads.
- The Canvas document GET route **must** declare a complete HTML document response. UIX then injects the effective feature base.
- The iframe **must** load the current authored Canvas from a bound document URL generated by the feature's typed client.
- The served document **must** include the Canvas browser shim and an embedded current revision. Iframe scripts cannot read response headers.
- The shim **must** derive its writeback URL from the document base. Authored HTML contains only relative addresses.
- Authored HTML **must not** contain host domains, ports, attachment tokens, or an authored `<base href>` element.
- The injected base is derived content. It enters no Canvas version, anchored read, or Agent-visible diff.
- Browser writeback **must** replace the complete authored document through HTTP using a JSON body.
- The former Canvas channel requests for document read and writeback **must** be removed rather than retained as a compatibility path.
- Canvas invalidation events **must** continue through WebSocket channels. Canvas does not require SSE.

### Conditional writeback and multiple connections

- A successful document load **must** provide a strong current revision suitable for an HTTP `ETag` and embed that same revision in the served document.
- The writeback route **must** declare an `If-Match` request header. The shim presents the base revision through it.
- The buffer passes the expected revision to the managed document's conditional replacement. Revision comparison and replacement **must** be atomic.
- A stale writeback **must not** overwrite newer current content. Canvas returns the declared `412` response with the winning revision.
- In the first version, the client **may** resolve `412` by loading the winning revision. This **may** discard unsaved local DOM.
- A successful writeback **must** return the new current revision.
- The originating connection **must** update its revision from the successful response. It **must not** wait for the same change to return as an invalidation event.
- Other attachments targeting the same Agent **must** receive a Canvas invalidation containing the key and new revision.
- A peer with no unpersisted edits **may** reload after that invalidation and submit its next write against the new revision.
- Retargeting or closing an attachment **must** prevent its revoked Canvas location from submitting future writebacks. An accepted writeback **must** finish against the Agent instance selected when UIX accepted it.

### Browser shim and persisted DOM

- The shim **must** reflect live native form-control state into the serialized clone used for writeback.
- Ordinary document content is not globally editable. Native controls and explicitly authored editable regions produce writeback.
- Serialization **must** operate on a clone and **must not** mutate the displayed DOM.
- `data-uix-persist="none"` **must** omit the marked derived element from serialized authored HTML.
- `data-uix-persist="shell"` **must** retain the marked element and its authored attributes while omitting dynamically generated children.
- The injected base element is derived and **must** include a Canvas marker so writeback omits it. Canvas owns this marker and rule.
- Authored `<base href>` is reserved. Canvas canonicalization **must** reject it so a base cannot enter stored document content.
- Derived HTML loaded from feature routes, including source fragments, **must** therefore remain outside Canvas versions, anchored Agent reads, and Agent-visible diffs.
- Durable review comments or other human-authored application state **may** remain ordinary Canvas markup and persist through writeback.
- The shim **must** expose an explicit writeback trigger for components whose meaningful authored state changes outside native input events.

### Prompt actions

- A Canvas **may** declare a human-operated prompt action in authored HTML.
- Only a trusted human gesture **may** trigger that action through the shim.
- The iframe **must** accept control messages only from its parent. The parent **must** accept Canvas messages only from the mounted iframe and expected Canvas origin.
- The shim **must** successfully persist pending authored changes before it submits the prompt.
- Prompt dispatch continues through the existing parent bridge and Agent channel rather than feature web routes.
- The prompt bridge **must not** include the complete Canvas document after HTTP writeback becomes the source of truth.
- The parent **must** reject an action from a Canvas view whose connection attachment has retargeted or closed.

### Turn state and Agent context

- Canvas **must** contribute one private turn-state cell whose complete value maps Canvas document identities to immutable Canvas version ids for that Agent viewpoint.
- Canvas owns creation and restoration of that value but **must not** implement generic turn-state commits, selected-branch lookup, or restore scheduling.
- Restoring the Canvas cell **must** restore document content and anchor metadata and reset loaded Canvas documents omitted from the selected state.
- Canvas **must** publish invalidation for documents changed by restoration.
- Canvas **must** derive model-visible human changes from the current and previous committed document versions, not from rendered DOM or the list of open documents.
- Agent-visible Canvas diffs **must** use current anchors and include only authored document changes.
- After an Agent tool changes Canvas, the next comparison baseline **must** include that result. Canvas **must not** later describe the Agent's own change as an unseen human change.

### Agent guidance

- Canvas **must** contribute stable Agent guidance describing its document vocabulary, anchored tool contract, and authored-versus-derived persistence behavior.
- Canvas **must** point the Agent to detailed authoring and reusable-asset documentation instead of adding the complete component library to every Agent turn.

### Trust boundary

- Canvas browser content is trusted like admitted workspace feature code. The iframe **must not** be described as protection from hostile code.
- The iframe remains a document, CSS, global-object, and lifecycle boundary even when its routes and assets share the Canvas feature namespace.
- Canvas browser content **must not** gain access to host internals merely because it can call its feature-local web routes.

### Assets and arbitrary web use cases

- Canvas **must** make HTMX available as an optional ordinary static asset at a documented Canvas-relative location.
- Canvas **must not** interpret HTMX attributes or require HTMX for document behavior.
- Canvas **may** provide a reusable static component library. It does not require a component framework, template language, server-side component catalog, or hydration abstraction.
- Agent-authored Canvas HTML **may** use plain markup, scripts, custom elements, CSS, HTMX, and feature-local relative routes.
- New backend route code is trusted feature source and becomes active through ordinary feature reload.
- Application-specific handlers and rendered fragments are not Canvas behavior.

## Conformance

A conforming implementation demonstrates these outcomes:

1. An Agent creates a Canvas through anchored tools. The browser loads that Agent viewpoint's canonical HTML directly from its document route. Canvas document bytes do not cross the channel request path.
2. Two connections load one Canvas revision. The first conditional write succeeds and notifies the peer. A racing stale write receives `412` and cannot overwrite the winner.
3. Agent edits and whole-document writes update the current document read by browser GET. They return current anchored content and publish an invalidation event without HTML.
4. A Canvas loads a selected range of a relative worktree file into an element marked `data-uix-persist="shell"`. Later writeback persists the element and its authored attributes but not the escaped source fragment.
5. Native form state, explicit editable content, and ordinary review-comment markup survive writeback and Canvas version restoration, while `none` and `shell` derived DOM do not.
6. A trusted prompt action completes writeback first, sends no HTML through the prompt bridge, and prompts only the Agent still targeted by that connection.
7. Turn state records Canvas version references, and branch restoration preserves the document and its anchors. Canvas Agent context includes only unseen authored changes between committed versions.
8. The same Canvas document and relative assets/routes work through Electron and web hosts without persisted physical URLs or Canvas-authored attachment logic.

## Degrees of freedom

A conforming implementation may choose:

- The physical document store and immutable version representation.
- The strong-revision algorithm and internal compare-and-set mechanism.
- The iframe's physical URL and how UIX constructs its relative base URL.
- The exact shim implementation and writeback debounce interval.
- The HTML parser used for canonicalization.
- The syntax and contents of optional reusable Canvas assets beyond the required HTMX availability.
- Whether a stale local DOM reload is automatic or requires a simple user acknowledgement in the first version.

These choices must preserve the authored source of truth, stale-write rejection, branch restoration, and omission of derived DOM. They must also preserve concise Agent context and relative addressing.

## Open questions

- How should the losing human writeback be preserved for Agent-assisted reconciliation before the client reloads the winning revision?
- Which Canvas version should a browser GET serve while a branch transition or feature reload is in progress?
- What later conflict artifact should preserve a losing human writeback for Agent-assisted reconciliation before the client reloads the winning revision?
- How should export work when a Canvas document depends on derived content from currently active feature routes?
