import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import ReactMarkdown, { type Components } from "react-markdown";
import { refractor } from "refractor";
import remarkGfm from "remark-gfm";

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
  code({ children, className }) {
    const language = className?.match(LanguageClass)?.[1];
    if (
      !language ||
      !refractor.registered(language) ||
      typeof children !== "string"
    ) {
      return <code className={className}>{children}</code>;
    }

    const tree = refractor.highlight(children, language);
    return (
      <code className={className} data-language={language}>
        {toJsxRuntime(tree, { Fragment, jsx, jsxs })}
      </code>
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

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
