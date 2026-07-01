// Optimistic pending user rows — the renderer-local half of eventual
// consistency for the transcript. The composer appends a pending row
// immediately (composer state, not transcript truth); main later emits the
// authoritative born-keyed row, which confirms/replaces the pending one.
// The prefix is the single marker of pendingness: it never collides with
// main-issued ids (`live:*` handles, pi entry ids) and styling keys off it.

const PENDING_USER_ID_PREFIX = "local:pending:";

let nextPendingId = 1;

export function pendingUserId(): string {
  return `${PENDING_USER_ID_PREFIX}${nextPendingId++}`;
}

export function isPendingUserId(id: string): boolean {
  return id.startsWith(PENDING_USER_ID_PREFIX);
}
