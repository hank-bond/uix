// UIX cockpit — HTML canonicalization at the anchored-core boundary.
//
// Every document that enters the anchored editor is normalized first, so the
// core — and the anchors it hands the agent — always describes one canonical
// form. This is what will make the human-writeback diff stable: a human edit is
// reserialized through the same normalizer, so unchanged regions stay
// byte-identical to the base and Myers reports only real changes.
//
// This is a *normalizer*, not a formatter. parse5 maps the input to the HTML
// spec's own serialization (lowercased tags, quoted attributes, normalized void
// elements and entities, tree correction) and deliberately does NOT reflow:
// whitespace text nodes, including the author's newlines, are preserved
// verbatim, so canonicalization can't change how the document renders. The flip
// side is that line granularity is whatever the author emitted — the agent is
// asked to write one block-level element per line so edits address fine-grained
// anchors. Imposing line breaks (reflow) is a separate, later concern.
//
// parse5 is ESM-only and is bundled into the main process (excluded from
// externalizeDepsPlugin in electron.vite.config.ts) so these stay synchronous.

import { parse, parseFragment, serialize } from "parse5";

// Canonicalize a whole HTML document — used on agent `write` (a full authored
// document) and when loading stored content into the editor.
export function canonicalizeHtml(html: string): string {
  return serialize(parse(html));
}

// Canonicalize a fragment — the replacement body of an `edit`, which is a span
// of lines rather than a whole document. parseFragment avoids wrapping the
// snippet in the html/head/body skeleton a full document parse would inject.
export function canonicalizeFragment(html: string): string {
  return serialize(parseFragment(html));
}
