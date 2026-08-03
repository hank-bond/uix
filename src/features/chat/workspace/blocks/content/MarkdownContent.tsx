// Renders markdown text with gfm tables and safe external-link handling.

import type { JSX } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./CodeBlock";
import { HighlightedCode } from "./HighlightedCode";

const LanguageClass = /(?:^|\s)language-([\w-]+)(?:\s|$)/;

const components: Components = {
  a({ children, href, title }) {
    if (!href || !isExternalWebHref(href)) {
      return <span title={title}>{children}</span>;
    }
    return (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  code({ children, className }) {
    if (typeof children !== "string") {
      return <code className={className}>{children}</code>;
    }
    return (
      <HighlightedCode
        text={children}
        language={className?.match(LanguageClass)?.[1]}
        className={className}
      />
    );
  },
  img({ alt, title }) {
    const label = alt?.trim();
    return (
      <span data-uix-part="markdown-image" title={title}>
        {label ? `[image: ${label}]` : "[image]"}
      </span>
    );
  },
};

function isExternalWebHref(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function MarkdownContent({ text }: { text: string }): JSX.Element {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
