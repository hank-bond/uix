// Applies no-store and browser-hardening headers to mutable HTTP responses.

import type { FastifyReply } from "fastify";

export function setMutableResponseHeaders(reply: FastifyReply): void {
  reply
    .header("Cache-Control", "no-store")
    .header("Referrer-Policy", "no-referrer")
    .header("X-Content-Type-Options", "nosniff");
}
