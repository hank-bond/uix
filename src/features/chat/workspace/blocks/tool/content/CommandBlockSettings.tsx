// Opens the command-block presentation settings from a hover-revealed row action.

import type { JSX } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { useBlockPresentationSettings } from "../../BlockPresentationSettings";

export function CommandBlockSettings(): JSX.Element {
  const { settings, loading, error, setCommandLayout } =
    useBlockPresentationSettings();
  const [open, setOpen] = useState(false);
  const [writeError, setWriteError] = useState<Error | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const structured = settings.command.layout === "structured";
  const displayedError = writeError ?? error;

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeFromEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  return (
    <div className="command-block-settings" ref={rootRef}>
      <button
        className="command-block-settings__trigger"
        type="button"
        aria-label="Command block settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Command block settings"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">⚙︎</span>
      </button>
      {open ? (
        <div
          className="command-block-settings__popover"
          role="dialog"
          aria-labelledby={titleId}
        >
          <strong id={titleId}>Command blocks</strong>
          <span className="command-block-settings__scope">
            Applies to all command calls.
          </span>
          <label className="command-block-settings__option">
            <input
              type="checkbox"
              checked={structured}
              disabled={loading}
              onChange={(event) => {
                setWriteError(undefined);
                void setCommandLayout(
                  event.currentTarget.checked ? "structured" : "literal",
                ).catch((thrown: unknown) => {
                  setWriteError(
                    thrown instanceof Error
                      ? thrown
                      : new Error(String(thrown)),
                  );
                });
              }}
            />
            <span>Structure shell commands</span>
          </label>
          {displayedError ? (
            <span className="command-block-settings__error" role="alert">
              {displayedError.message}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
