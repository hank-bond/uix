---
summary: "Server composition root and adapters: HTTP, live transport, process lifecycle, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing server-host code, or deciding that a capability is server distribution rather than shared substrate."
status: stub
---

# Server host

Empty. Owns the server composition and adapters: HTTP, live transport, process lifecycle, and client bootstraps over the shared supervisor, runtime, and clients. It starts with zero active workspace runtimes, exposes the launcher catalog, serves canonical workspace-session routes, and creates one attachment per live connection. The live transport speaks the same discriminated request, response, error, and event frames as Electron's IPC, and every crossing records through the shared wire-log chokepoint. The host never depends on the Electron host or app features.
