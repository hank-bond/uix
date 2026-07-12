---
summary: "UIX uses one app-owned Pi profile shared across workspaces, while workspace cwd supplies project-local resources and the host Pi profile is never inherited."
status: accepted
---

# UIX owns one shared Pi profile

Electron computes the profile directory as `join(app.getPath("userData"), "pi")` and injects it into every UIX agent driver as Pi's `agentDir`. The directory is shared by all UIX workspaces in the application and contains Pi's profile-level authentication, settings, custom models, extensions, skills, prompts, and context.

The profile is separate from both other state scopes. Each workspace's agent cwd continues to supply Pi's project-local `.pi` settings and resources, and UIX continues to pin that workspace's session history under `.uix/sessions`. UIX's workspace model default remains in `uix.workspace.json`; Pi's current `setModel()` also writes its profile default as a fallback, which is accepted until Pi offers a session-only model switch.

UIX does not call Pi's host-profile resolver, copy from `~/.pi/agent`, or fall back to host configuration. Existing users reconnect providers inside UIX; migration and import UI are separate product work. Process environment variables remain ambient and can still provide credentials or configuration to Pi—isolating those would require a separate process with a controlled environment.

A single shared profile matches the product boundary: pilots normally connect a provider once for UIX rather than maintaining credentials per workspace. If a future application needs per-workspace credentials, it should make that an explicit profile choice rather than add implicit dual-profile fallback.
