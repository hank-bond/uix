// Defines renderer-local pending user-row identities that cannot collide with live or durable transcript ids.

const PENDING_USER_ID_PREFIX = "local:pending:";

export function pendingUserId(mutationId: string): string {
  return `${PENDING_USER_ID_PREFIX}${mutationId}`;
}

export function isPendingUserId(id: string): boolean {
  return id.startsWith(PENDING_USER_ID_PREFIX);
}
