import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActiveSessionProvider, useActiveSession } from "@uix/api/workspace";

function Probe() {
  const activeSession = useActiveSession();
  return <span>{activeSession?.displayLabel ?? "not established"}</span>;
}

describe("active session context", () => {
  it("exposes the controller-owned projection read-only", () => {
    const html = renderToStaticMarkup(
      <ActiveSessionProvider
        activeSession={{
          sessionId: "session-2",
          displayLabel: "New conversation",
          createdAt: "2026-07-19T11:00:00.000Z",
          modifiedAt: "2026-07-19T11:00:00.000Z",
        }}
      >
        <Probe />
      </ActiveSessionProvider>,
    );

    expect(html).toContain("New conversation");
  });

  it("distinguishes an unknown initial projection from missing wiring", () => {
    expect(
      renderToStaticMarkup(
        <ActiveSessionProvider activeSession={undefined}>
          <Probe />
        </ActiveSessionProvider>,
      ),
    ).toContain("not established");
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "ActiveSessionProvider is missing",
    );
  });
});
