import type { AnchoredChange } from "../../../main/anchors/document";
import { formatAnchoredText } from "../../../main/anchors/wire";

export function formatChangeHunks(
  label: string,
  changes: readonly AnchoredChange[],
): string {
  const removed = changes.flatMap((change) => change.oldLines);
  const added = changes.flatMap((change) => change.newLines);
  const header = `${label} (−${removed.length}/+${added.length})`;
  return added.length ? `${header}\n${formatAnchoredText(added)}` : header;
}

// Section body only — the state-message substrate owns the <canvas-diff>
// tag and the <uix-state> envelope around it.
export function formatCanvasChanges(
  changes: ReadonlyMap<string, readonly AnchoredChange[]>,
): string {
  const sections: string[] = [];
  for (const [key, hunks] of changes) {
    sections.push(formatChangeHunks(`## ${key}`, hunks));
  }
  return sections.join("\n\n");
}
