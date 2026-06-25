export const CanvasChannelNames = {
  refresh: "refresh",
  writeback: "writeback",
  changed: "changed",
} as const;

export const CanvasRequestAddresses = {
  refresh: "canvas.refresh",
  writeback: "canvas.writeback",
} as const;

export const CanvasEventAddresses = {
  changed: "canvas.changed",
} as const;
