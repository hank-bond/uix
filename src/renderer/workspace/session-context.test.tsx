import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  useWorkspaceSession,
  WorkspaceSessionProvider,
} from "@uix/api/workspace";

function Probe() {
  const { activeSession } = useWorkspaceSession();
  return <span>{activeSession?.displayLabel ?? "not established"}</span>;
}

const loadActiveHistory = () => Promise.resolve({ items: [] });
const switchSession = () => Promise.resolve(undefined);

describe("active session context", () => {
  it("exposes the controller-owned projection read-only", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSessionProvider
        session={{
          activeSession: {
            sessionId: "session-2",
            displayLabel: "New conversation",
            createdAt: "2026-07-19T11:00:00.000Z",
            modifiedAt: "2026-07-19T11:00:00.000Z",
          },
          recentSessions: undefined,
          sessionSelectionVersion: 1,
          canSwitchSession: true,
          loadActiveHistory,
          switchSession,
        }}
      >
        <Probe />
      </WorkspaceSessionProvider>,
    );

    expect(html).toContain("New conversation");
  });

  it("distinguishes an unknown initial projection from missing wiring", () => {
    expect(
      renderToStaticMarkup(
        <WorkspaceSessionProvider
          session={{
            activeSession: undefined,
            recentSessions: undefined,
            sessionSelectionVersion: 0,
            canSwitchSession: true,
            loadActiveHistory,
            switchSession,
          }}
        >
          <Probe />
        </WorkspaceSessionProvider>,
      ),
    ).toContain("not established");
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "WorkspaceSessionProvider is missing",
    );
  });
});
