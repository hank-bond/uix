---
summary: "A UI component's private stylesheet lives beside it with the same basename and explicit cascade order."
kind: reference
---

# Own component stylesheets

**Rule: must.** A UI component's private stylesheet lives beside it with the same basename: `SessionPill.tsx` owns `SessionPill.css`. Private subcomponents in that module share the owner's sheet. A stylesheet with no single component owner uses a narrow lowercase-kebab name such as `picker-positioning.css` or `provider-controls.css`. Do not let shared sheets become miscellaneous overrides.

**Approved example:** `SessionPill.tsx` and `SessionPill.css` sit beside each other, and the surface's `styles` array imports `SessionPill.css` explicitly.

**Nonconforming example:** A generic `styles.css` imported by several unrelated components, or styles hidden behind CSS imports in a component file.

**Reason:** The pairing keeps ownership visible and the cascade order explicit. Import and order CSS module scripts in the owning `surface.tsx` `styles` array, with shared foundations before component sheets. The substrate wraps every adopted sheet in the same surface `@scope`, so only name-global declarations escape the scope.
