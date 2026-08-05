---
summary: "Expose a stable property as a readonly property and name a method with the operation that produces or retrieves its result."
kind: reference
---

# Distinguish properties from operations

**Rule: must.** Expose a stable property as a readonly property. Name a method with the operation that produces or retrieves its result.

**Approved example:** Use `getStatus()`, `toUrl()`, or `createResourceContributions()` for operations.

**Nonconforming example:** Do not use `status()`, `url()`, or `resourceContributions()` for those operations.
