---
summary: "Electron composition root and adapters: native chrome, IPC, protocol, windows, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing Electron-specific host code, or deciding that a capability is Electron packaging rather than shared substrate."
status: stub
---

# Electron host

Empty until H7 reconstitutes Electron as a discrete host. This root then receives the Electron main, preload, launcher client bootstrap, native chrome, IPC, protocol, recents, dialogs, and packaging assumptions from `src/main` and `src/preload`. Each workspace window binds to one attachment rather than broadcasting through `BrowserWindow.getAllWindows()`. The host composes the shared supervisor, runtime, and clients through concrete adapters and never depends on the server host or app features.
