---
summary: "Name a UIX-owned function or method with an approved operation form, a verb phrase by default."
kind: reference
---

# Name an operation with an approved form

**Rule: must.** Use an approved operation form for a UIX-owned function or method.

**Approved example:** Use a verb phrase by default. For example, use `registerAction()`, `publishChannelEvent()`, and `runAction()`. Let a receiver provide established context when the shorter name stays unambiguous:

```ts
actionRegistry.register();
eventPublisher.publish();
```

Use a prepositional form only when the controlled lexicon defines its exact operation meaning. Approved forms include `asRecord()`, `settingsRegistry.forScope()`, and `toUrl()`.

**Nonconforming example:** Do not introduce an unapproved prepositional form. Do not use a noun-only method name for an operation:

```ts
driver.status();
address.url();
pipeline.resourceContributions();
```
