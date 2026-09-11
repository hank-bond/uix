// Extracts and truncates display text from transcript content values.

export function extractTextContent(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return extractTextBlocks(value) ?? value;
  if (typeof value !== "object" || value === null) return value;

  const content = (value as { content?: unknown }).content;
  if (content !== undefined) return extractTextContent(content);
  return value;
}

export function truncateText(
  value: unknown,
  charLimit: number = 600,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, undefined, 2);
  return text.length > charLimit ? `${text.slice(0, charLimit)}…` : text;
}

function extractTextBlocks(value: unknown[]): string | undefined {
  const parts = value
    .map((block) => {
      if (typeof block === "string") return block;
      if (typeof block !== "object" || block === null) return undefined;
      const obj = block as { type?: unknown; text?: unknown };
      return obj.type === "text" && typeof obj.text === "string"
        ? obj.text
        : undefined;
    })
    .filter((part): part is string => part !== undefined);
  // An empty text block is still text, not an unknown structured payload.
  return parts.length ? parts.join("") : undefined;
}
