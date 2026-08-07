// Renders the plain code block container for highlighted output.

import type { ReactNode } from "react";
import type { JSX } from "react";

export function CodeBlock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const classes = ["code-block", className].filter(Boolean).join(" ");
  return <pre className={classes}>{children}</pre>;
}
