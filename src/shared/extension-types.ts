// Legacy extension-author types re-exported by src/api/index.ts.
//
// The broader `@uix/api` surface now also contains small runtime helpers for
// feature contracts. This file stays type-only because the trusted extension
// command API still receives its runtime `uix` object by injection.

/**
 * Context object passed to a command handler when it's invoked.
 *
 * Empty today; will grow as commands gain affordances (calling
 * pane, modifier keys, args, etc.). Adding fields here is
 * non-breaking — extensions that don't use them are unaffected.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- placeholder; will grow as commands gain affordances (see docstring)
export interface CommandContext {}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;

export interface CommandOptions {
  /** Human-readable description, shown in command palette / docs. */
  description?: string;
  /** Function invoked when the command is run. */
  handler: CommandHandler;
}

/**
 * Surface an extension uses to contribute to UIX.
 *
 * All `register*` methods return `void`. Cleanup is tied to the
 * extension's lifecycle: the substrate disposes everything an
 * extension registered when the extension unloads. Extension
 * authors don't track per-registration disposables.
 *
 * Mirrors pi's `ExtensionAPI` shape deliberately.
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
 * import type { ExtensionFactory } from "@uix/api";
 *
 * const activate: ExtensionFactory = (uix) => {
 *   uix.registerCommand("hello.say-hi", {
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
export type ExtensionFactory = (uix: ExtensionAPI) => void | Promise<void>;
