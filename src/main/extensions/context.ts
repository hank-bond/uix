// Per-extension ExtensionAPI factory.
//
// The loader (commit 4) creates one of these per discovered
// extension, with a DisposableBag scoped to the extension's
// lifetime. Anything the extension registers through this API
// enrolls a cleanup task in the bag; when the extension unloads
// (reload, app quit), the bag disposes and every registration
// goes with it.
//
// Right now the methods are stubs — they log what would have
// happened and enroll a no-op disposable. The actual registries
// (command registry, etc.) arrive in later commits; their wiring
// goes here without changing the shape extensions see.

import type { ExtensionAPI } from "@trellis/api";

import { disposable, type DisposableBag } from "../lifecycle";
import { createLogger } from "../log";

const log = createLogger("extensions");

/**
 * Build the `ExtensionAPI` object passed into an extension's
 * factory function.
 *
 * @param extensionId stable id (the discovery package id) — used
 *   as a log field for attribution.
 * @param bag per-extension lifetime; the loader disposes this when
 *   the extension unloads. All cleanup an extension would otherwise
 *   have to track manually enrolls here.
 */
export function createExtensionAPI(
  extensionId: string,
  bag: DisposableBag,
): ExtensionAPI {
  const elog = log.child({ extension: extensionId });

  return {
    registerCommand(name, options) {
      elog.info(
        { command: name, description: options.description },
        "command_registered",
      );
      // No real registry yet — commit 4+ replaces this with an
      // entry in the command registry. The disposable still goes
      // into the bag so the lifecycle shape is correct from day 1.
      bag.add(
        disposable(() => {
          elog.info({ command: name }, "command_unregistered");
        }),
      );
    },
  };
}
