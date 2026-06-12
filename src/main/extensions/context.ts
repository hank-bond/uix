// Per-extension ExtensionAPI factory.
//
// The loader creates one of these per activated extension entry,
// with a DisposableBag scoped to the extension's lifetime. Anything
// the extension registers through this API enrolls a cleanup task
// in the bag; when the extension unloads (reload, app quit), the
// bag disposes and every registration goes with it.
//
// Right now the methods are stubs — they log what would have
// happened and enroll a no-op disposable. The actual registries
// (command registry, etc.) arrive in later commits; their wiring
// goes here without changing the shape extensions see.

import type { ExtensionAPI } from "@uix/api";

import { disposable, type DisposableBag } from "../lifecycle";
import { createLogger } from "../log";

const log = createLogger("extensions");

/**
 * Minimal identity for an activated extension entry.
 *
 * `entry` (absolute path to the entry file) is the unique
 * identifier. `displayName` is the human-readable label from the
 * package directory, used in log messages and child-logger fields
 * where verbose paths would clutter.
 */
export interface ExtensionIdentity {
  displayName: string;
  entry: string;
}

/**
 * Build the `ExtensionAPI` object passed into an extension's
 * factory function.
 *
 * @param identity which extension this API is for, used for log
 *   attribution (every line carries `extension` + `entry` fields).
 * @param bag per-extension lifetime; the loader disposes this when
 *   the extension unloads. All cleanup an extension would otherwise
 *   have to track manually enrolls here.
 */
export function createExtensionAPI(
  identity: ExtensionIdentity,
  bag: DisposableBag,
): ExtensionAPI {
  const elog = log.child({
    extension: identity.displayName,
    entry: identity.entry,
  });

  return {
    registerCommand(name, options) {
      elog.debug(
        { command: name, description: options.description },
        "command_registered",
      );
      // No real registry yet — a later commit replaces this with
      // an entry in the command registry. The disposable still
      // goes into the bag so the lifecycle shape is correct from
      // day 1.
      bag.add(
        disposable(() => {
          elog.debug({ command: name }, "command_unregistered");
        }),
      );
    },
  };
}
