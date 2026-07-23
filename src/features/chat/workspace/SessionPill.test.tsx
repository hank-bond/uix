import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  WorkspaceSessionProvider,
  type WorkspaceSessionHandle,
} from "@uix/api/workspace";

import { SessionPill } from "./SessionPill";

const session: WorkspaceSessionHandle = {
  activeSession: {
    sessionId: "session-1",
    displayLabel: "Investigate session switching",
    createdAt: "2026-07-22T10:00:00.000Z",
    modifiedAt: "2026-07-22T11:00:00.000Z",
  },
  recentSessions: [],
  sessionSelectionVersion: 0,
  canSwitchSession: true,
  loadActiveHistory: () => Promise.resolve({ items: [] }),
  switchSession: () => Promise.resolve(undefined),
};

describe("session pill", () => {
  it("presents the active session as a dialog trigger", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSessionProvider session={session}>
        <SessionPill />
      </WorkspaceSessionProvider>,
    );

    expect(html).toContain("Investigate session switching");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("disabled");
  });

  it("disables switching while the workspace session controller is busy", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSessionProvider
        session={{ ...session, canSwitchSession: false }}
      >
        <SessionPill />
      </WorkspaceSessionProvider>,
    );

    expect(html).toContain("disabled");
  });
});
