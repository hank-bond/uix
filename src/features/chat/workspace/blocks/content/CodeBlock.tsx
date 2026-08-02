import type { ReactNode } from "react";
import type { JSX } from "react";

export function CodeBlock({ children }: { children: ReactNode }): JSX.Element {
  return <pre className="code-block">{children}</pre>;
}
