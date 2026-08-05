---
summary: "Name a callable type with a noun phrase whose head noun identifies the callable role."
kind: reference
---

# Name a callable type by role

**Rule: must.** Use a noun phrase for a type, interface, class, or named callable type. The head noun of a callable type must identify the callable role.

**Approved examples:**

- `ChannelRequestHandler`
- `ActionContributionRegistrar`
- `ChannelEventPublisher`
- `ActionRunner`

**Nonconforming examples:**

- `HandleChannelRequest`
- `RegisterActionContribution`
- `PublishChannelEvent`
- `RunAction`

Do not disguise an operation as a role suffix. Use `XHandler`, not `XHandle`, for a callback that handles an occurrence. Use `XPublisher`, not `XPublish`. Use `XRunner`, not `XRun`.
