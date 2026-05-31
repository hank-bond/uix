// Public types for extension authors.
//
// Imported by extensions as `@trellis/api` (a tsconfig path alias).
// When external extensions exist and we publish, this file moves to
// `packages/api/src/index.ts`, the alias goes away, and the
// extension-facing import shape stays identical. See
// docs/architecture.md ("extension-facing types live behind
// `@trellis/api`").
//
// IMPORTANT: only types live here. Extensions never `import` a
// runtime value from `@trellis/api` — the `trellis` object passed
// to the factory is constructed by the loader and handed in. That's
// why a tsconfig alias is sufficient: `import type` is erased at
// compile, so nothing ever has to resolve `@trellis/api` at runtime.

/**
 * Context object passed to a command handler when it's invoked.
 *
 * Empty for v0; will grow as commands gain affordances (calling
 * pane, modifier keys, args, etc.). Adding fields here is
 * non-breaking — extensions that don't use them are unaffected.
 */
export interface CommandContext {}

export type CommandHandler = (
  ctx: CommandContext,
) => void | Promise<void>;

export interface CommandOptions {
  /** Human-readable description, shown in command palette / docs. */
  description?: string;
  /** Function invoked when the command is run. */
  handler: CommandHandler;
}

/**
 * Surface an extension uses to contribute to Trellis.
 *
 * All `register*` methods return `void`. Cleanup is tied to the
 * extension's lifecycle: the substrate disposes everything an
 * extension registered when the extension unloads. Extension
 * authors don't track per-registration disposables.
 *
 * Mirrors pi's `ExtensionAPI` shape deliberately. See
 * docs/architecture.md.
 */
export interface ExtensionAPI {
  /**
   * Register a command callable by name. Commands are the primary
   * "extension contributes a verb the system can call" primitive
   * (invoked from a future command palette, keybindings,
   * extension-to-extension calls, etc.).
   */
  registerCommand(name: string, options: CommandOptions): void;
}

/**
 * Default export shape for an extension entry file.
 *
 * @example
 * ```ts
 * import type { ExtensionFactory } from "@trellis/api";
 *
 * const activate: ExtensionFactory = (trellis) => {
 *   trellis.registerCommand("hello.say-hi", {
 *     description: "Say hi from hello",
 *     handler: () => console.log("hi"),
 *   });
 * };
 * export default activate;
 * ```
 *
 * Async factories are supported so extensions can `await` during
 * activation (dynamic imports, async config load, etc.).
 */
export type ExtensionFactory = (
  trellis: ExtensionAPI,
) => void | Promise<void>;
