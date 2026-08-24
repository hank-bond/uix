// Derives Chat composer presentation and keyboard intent from shared turn activity.

export interface ComposerPresentation {
  readonly action: "cancel" | "submit";
  readonly disabled: boolean;
  readonly label: "send" | "stop" | "stopping…";
}

export function deriveComposerPresentation({
  canStop,
  isStopping,
  hasDraft,
}: {
  canStop: boolean;
  isStopping: boolean;
  hasDraft: boolean;
}): ComposerPresentation {
  if (isStopping) {
    return { action: "cancel", disabled: true, label: "stopping…" };
  }
  if (canStop) {
    return { action: "cancel", disabled: false, label: "stop" };
  }
  return { action: "submit", disabled: !hasDraft, label: "send" };
}

export function deriveComposerKeyboardIntent({
  key,
  shiftKey,
  canStop,
  isStopping,
}: {
  key: string;
  shiftKey: boolean;
  canStop: boolean;
  isStopping: boolean;
}): "cancel" | "submit" | "prevent" | undefined {
  if (key === "Escape" && canStop && !isStopping) return "cancel";
  if (key === "Enter" && !shiftKey) {
    return canStop || isStopping ? "prevent" : "submit";
  }
  return undefined;
}
