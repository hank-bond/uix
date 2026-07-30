import type { ReactNode } from "react";

export function CodeBlock({ children }: { children: ReactNode }) {
  return <pre className="code-block">{children}</pre>;
}
