---
summary: "Electron composition root and adapters: native chrome, IPC, protocol, windows, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing Electron-specific host code, or deciding that a capability is Electron packaging rather than shared substrate."
status: stub
---

# Electron host

Empty. Owns the Electron composition and adapters: native chrome, IPC, protocol, windows, and client bootstraps over the shared supervisor, runtime, and clients. Each workspace window binds to one attachment, and runtime events route only to matching windows. The host never depends on the server host or app features.
