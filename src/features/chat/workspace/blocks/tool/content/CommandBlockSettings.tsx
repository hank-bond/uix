// Opens the command-block presentation settings from a hover-revealed row action.

import type { JSX } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useBlockPresentationSettings } from "../../BlockPresentationSettings";

export function CommandBlockSettings(): JSX.Element {
  const { settings, loading, error, setCommandLayout } =
    useBlockPresentationSettings();
  const [open, setOpen] = useState(false);
  const [writeError, setWriteError] = useState<Error | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const structured = settings.command.layout === "structured";
  const displayedError = writeError ?? error;

  // Transient UI selects useful initial focus (the popover's only control)
  // and restores the invoking control on close.
  useEffect(() => {
    if (!open) return;
    if (loading) {
      rootRef.current?.focus();
    } else {
      checkboxRef.current?.focus();
    }
  }, [loading, open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        close();
      }
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [close, open]);

  return (
    <div className="command-block-settings" ref={rootRef}>
      <button
        ref={triggerRef}
        className="command-block-settings__trigger"
        type="button"
        aria-label="Command block settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        title="Command block settings"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">⚙︎</span>
      </button>
      {open ? (
        <div
          id={dialogId}
          className="command-block-settings__popover"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <strong id={titleId}>Command blocks</strong>
          <span className="command-block-settings__scope">
            Applies to all command calls.
          </span>
          <label className="command-block-settings__option">
            <input
              ref={checkboxRef}
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
