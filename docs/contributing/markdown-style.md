---
summary: "UIX documentation uses consistent Markdown for document layout, headings, lists, code, links, tables, HTML, and line wrapping."
kind: reference
read_when: "Read before writing or reviewing Markdown structure and formatting."
---

# Markdown style

These guidelines define how the repository formats documentation. Depart deliberately when it serves readers, and remain consistent when departing. Prettier enforces the mechanical format.

## Document layout

Every document follows its layer's conventions: frontmatter with a `summary` first, one H1 close to the filename, then the layer's shape. The [`frontmatter.md`](./frontmatter.md) reference defines metadata, and each directory's `AGENTS.md` owns its local structure.

## Headings

Use ATX headings, one H1 per document, sentence case, and no end punctuation. Do not use em dashes or code in headings. Use a colon or comma instead of a dash.

Task headings start with an imperative verb, such as "Add a channel." Concept headings are noun phrases, such as "Channel contracts." Keep same-kind sections parallel. Fixed structural labels, such as "Current synthesis" and "Where to read," and established gerunds, such as "Logging," are exceptions.

## Lists

Use a numbered list when order matters or the list claims a complete enumeration. Use a bulleted list when order does not matter and the items are examples or a partial set.

Use bold run-in lead-ins with a colon (`**Term:** description`). End each item with a period unless it consists entirely of code or link text. Keep items parallel in syntax. Begin each one with a capital letter.

## Code

Use fenced blocks for anything longer than one line, and always declare the language. Do not indent code blocks. Introduce a sample with a complete sentence, and show omissions with a comment in the sample's language.

Command placeholders use `{PLACE_HOLDER}`: uppercase, underscore-separated, and inside single braces. Double braces collide with template interpolation, and bare names do not distinguish placeholders.

## Links

Use relative paths for internal documents, including `../` segments when needed. In prose, use the target filename in code font by default. For example, write "[`document-boundaries.md`](./document-boundaries.md)."

Generated indexes and directory routes use descriptive slugs because repeated `AGENTS.md` labels hide destinations. Do not use "here," "link," or bare URLs as link text. Avoid repeating a destination within one short section. Repeat it in a long reference only when readers need a local route. Generated indexes may repeat authored overview links.

Use inline links by default. Use reference links only for long destinations, usually in table cells, or repeated destinations.

## Tables

Use tables for scannable comparison data, such as primitives, layers, and lookups. Prefer lists when the same information reads as well in list form.

Introduce a table with a complete sentence. Use sentence-case column heads, keep cells short, and sort rows in a logical order. Wide reference lookups are acceptable. Use longer cells only when the lookup needs prose.

## HTML

Prefer standard Markdown. Use HTML only when HTML is the documented content, such as a specification artifact or JSX code sample.

## Line wrapping

Do not hard-wrap prose. Write each paragraph and list item as one source line and let the editor soft-wrap it. Prettier uses `proseWrap: "never"`, so a hard-wrapped paragraph fails `npm run format:check`. Tables, code fences, and list structure are exempt.
