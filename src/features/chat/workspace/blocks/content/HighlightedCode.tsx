import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { refractor } from "refractor";

const ExtensionLanguages: Readonly<Record<string, string>> = {
  cjs: "javascript",
  cts: "typescript",
  htm: "markup",
  html: "markup",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  sh: "bash",
  svg: "markup",
  ts: "typescript",
  tsx: "typescript",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

interface HighlightedCodeProps {
  text: string;
  language?: string;
  className?: string;
}

/** Render literal source text, highlighting only a language Refractor knows. */
export function HighlightedCode({
  text,
  language,
  className,
}: HighlightedCodeProps) {
  const normalizedLanguage = language?.toLowerCase();
  const highlighted =
    normalizedLanguage && refractor.registered(normalizedLanguage)
      ? refractor.highlight(text, normalizedLanguage)
      : undefined;
  const classes = ["highlighted-code", className].filter(Boolean).join(" ");

  return (
    <code
      className={classes}
      data-language={highlighted ? normalizedLanguage : undefined}
    >
      {highlighted ? toJsxRuntime(highlighted, { Fragment, jsx, jsxs }) : text}
    </code>
  );
}

/** Infer a registered highlighting grammar from a lexical file extension. */
export function inferCodeLanguageFromPath(path: string): string | undefined {
  const basename = path.split(/[\\/]/).at(-1) ?? path;
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) return undefined;

  const extension = basename.slice(dot + 1).toLowerCase();
  const language = ExtensionLanguages[extension] ?? extension;
  return refractor.registered(language) ? language : undefined;
}
