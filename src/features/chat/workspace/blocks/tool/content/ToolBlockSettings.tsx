// Opens per-tool block presentation settings from a hover-revealed row action.
//
// Lists the tool's surfaceable params with "show in summary" toggles, and for
// command calls the shell-structure layout toggle. Persisted per tool name.

import type { JSX } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { toolParamVisibility } from "../../../../shared/settings";
import { useBlockPresentationSettings } from "../../BlockPresentationSettings";
import type { ToolParam } from "../presentation";

interface ToolBlockSettingsProps {
  toolName: string;
  label: string;
  params: ToolParam[];
}

export function ToolBlockSettings({
  toolName,
  label,
  params,
}: ToolBlockSettingsProps): JSX.Element {
  const { settings, loading, error, setToolParams, setCommandLayout } =
    useBlockPresentationSettings();
  const [open, setOpen] = useState(false);
  const [writeError, setWriteError] = useState<Error | undefined>();
  // Optimistic collapsed-key list for this tool. Settings round-trips are
  // async, so two rapid toggles would otherwise read the same stale settings
  // and the second write would clobber the first. The committed list replaces
  // this once it reflects the last write (see the adopt effect below).
  const [pendingCollapsed, setPendingCollapsed] = useState<
    string[] | undefined
  >();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const displayedError = writeError ?? error;
  const visibility = toolParamVisibility(settings, toolName);
  const collapsed = visibility?.collapsed;
  const structured = settings.command.layout === "structured";
  // Absent setting = show every surfaceable param (the chat default).
  const shownKeys = pendingCollapsed ?? collapsed;
  const isShown = (key: string): boolean =>
    shownKeys === undefined ? true : shownKeys.includes(key);

  useEffect(() => {
    if (!open) return;
    if (loading) {
      rootRef.current?.focus();
    } else {
      firstOptionRef.current?.focus();
    }
  }, [loading, open]);

  // Adopt the committed list once it reflects the last write. Until then the
  // optimistic list keeps rapid toggles from clobbering each other. Key-set
  // equality (not order) so a concurrent writer reordering keys does not wedge
  // the popover on stale optimistic state.
  useEffect(() => {
    if (pendingCollapsed === undefined) return;
    const committed = collapsed ?? params.map((param) => param.key);
    if (sameKeys(pendingCollapsed, committed)) {
      setPendingCollapsed(undefined);
    }
  }, [pendingCollapsed, collapsed, params]);

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

  const setShown = (key: string, shown: boolean): void => {
    setWriteError(undefined);
    const current = shownKeys ?? params.map((param) => param.key);
    const next = toggleParamKey(current, key, shown);
    setPendingCollapsed(next);
    void setToolParams(toolName, next).catch((thrown: unknown) => {
      setWriteError(
        thrown instanceof Error ? thrown : new Error(String(thrown)),
      );
      // Revert the optimistic checkbox to the committed state on failure.
      setPendingCollapsed(undefined);
    });
  };

  return (
    <div className="tool-block-settings" ref={rootRef}>
      <button
        ref={triggerRef}
        className="tool-block-settings__trigger"
        type="button"
        aria-label={`${label} block settings`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        title={`${label} block settings`}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">⚙︎</span>
      </button>
      {open ? (
        <div
          id={dialogId}
          className="tool-block-settings__popover"
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
          <strong id={titleId}>{label} blocks</strong>
          <span className="tool-block-settings__scope">
            Applies to all {label} calls.
          </span>
          <div className="tool-block-settings__params">
            {params.map((param, index) => (
              <label key={param.key} className="tool-block-settings__option">
                <input
                  ref={index === 0 ? firstOptionRef : undefined}
                  type="checkbox"
                  checked={isShown(param.key)}
                  disabled={loading}
                  onChange={(event) => {
                    setShown(param.key, event.currentTarget.checked);
                  }}
                />
                <span>
                  Show <code>{param.key}</code> in summary
                </span>
              </label>
            ))}
          </div>
          {toolName === "command" ? (
            <label className="tool-block-settings__option">
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
          ) : null}
          {displayedError ? (
            <span className="tool-block-settings__error" role="alert">
              {displayedError.message}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The next collapsed-keys list after toggling one param's summary visibility.
 * Appends newly shown keys in list order and drops hidden ones.
 */
export function toggleParamKey(
  current: string[],
  key: string,
  shown: boolean,
): string[] {
  return shown
    ? current.includes(key)
      ? current
      : [...current, key]
    : current.filter((entry) => entry !== key);
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a);
  return b.every((key) => keys.has(key));
}
