// Adds visual structure to conservative top-level shell operators without changing their source text.

import { type JSX } from "react";

import type { CommandLayout } from "../../../../shared/settings";
import { HighlightedCode } from "../../content/HighlightedCode";

interface CommandPiece {
  text: string;
  kind: "source" | "pipeline" | "logical";
}

interface OperatorOffset {
  index: number;
  operator: "|" | "&&" | "||";
}

export function StructuredCommand({
  command,
  layout,
}: {
  command: string;
  layout: CommandLayout;
}): JSX.Element {
  const pieces =
    layout === "structured" ? parseCommandPieces(command) : undefined;
  if (!pieces) return <HighlightedCode text={command} language="bash" />;

  return (
    <span className="structured-command" data-uix-part="structured-command">
      {pieces.map((piece, index) => (
        <span
          className={`structured-command__piece structured-command__piece--${piece.kind}`}
          key={`${String(index)}:${piece.text}`}
        >
          <HighlightedCode text={piece.text} language="bash" />
        </span>
      ))}
    </span>
  );
}

/**
 * Find only unquoted, unescaped, top-level pipelines and logical operators.
 * Returning undefined is intentional: uncertain shell syntax stays literal.
 */
export function parseCommandPieces(
  command: string,
): readonly CommandPiece[] | undefined {
  if (
    command.includes("\n") ||
    command.includes("\r") ||
    command.includes("<<")
  ) {
    return undefined;
  }

  const operators: OperatorOffset[] = [];
  let quote: "single" | "double" | undefined;
  let escaped = false;
  let parentheses = 0;
  let braces = 0;
  let brackets = 0;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "single") {
      escaped = true;
      continue;
    }
    if (quote === "single") {
      if (character === "'") quote = undefined;
      continue;
    }
    if (quote === "double") {
      if (
        character === "`" ||
        (character === "$" && command[index + 1] === "(")
      ) {
        return undefined;
      }
      if (character === '"') quote = undefined;
      continue;
    }
    if (character === "'") {
      quote = "single";
      continue;
    }
    if (character === '"') {
      quote = "double";
      continue;
    }
    // Backticks have nested escape and substitution rules. Keep them literal
    // rather than pretending this deliberately small scanner understands them.
    if (character === "`") return undefined;
    if (
      character === "#" &&
      (index === 0 || /\s/u.test(command[index - 1] ?? ""))
    ) {
      break;
    }

    switch (character) {
      case "(":
        parentheses += 1;
        continue;
      case ")":
        parentheses -= 1;
        break;
      case "{":
        braces += 1;
        continue;
      case "}":
        braces -= 1;
        break;
      case "[":
        brackets += 1;
        continue;
      case "]":
        brackets -= 1;
        break;
    }

    if (parentheses < 0 || braces < 0 || brackets < 0) return undefined;
    if (parentheses !== 0 || braces !== 0 || brackets !== 0) continue;

    if (character === "&" && command[index + 1] === "&") {
      operators.push({ index, operator: "&&" });
      index += 1;
      continue;
    }
    if (character === "|" && command[index + 1] === "|") {
      operators.push({ index, operator: "||" });
      index += 1;
      continue;
    }
    if (character === "|") {
      operators.push({ index, operator: "|" });
    }
  }

  if (quote || escaped || parentheses !== 0 || braces !== 0 || brackets !== 0) {
    return undefined;
  }
  if (operators.length === 0) return undefined;

  const pieces: CommandPiece[] = [];
  let cursor = 0;
  for (const { index, operator } of operators) {
    if (index > cursor) {
      pieces.push({ text: command.slice(cursor, index), kind: "source" });
    }
    let end = index + operator.length;
    if (operator !== "|") {
      while (end < command.length && /[\t ]/u.test(command[end] ?? "")) {
        end += 1;
      }
    }
    pieces.push({
      text: command.slice(index, end),
      kind: operator === "|" ? "pipeline" : "logical",
    });
    cursor = end;
  }
  if (cursor < command.length) {
    pieces.push({ text: command.slice(cursor), kind: "source" });
  }
  return pieces.every((piece) => piece.text) ? pieces : undefined;
}
