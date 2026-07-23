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
    firstUserMessage: {
      preview: "Investigate session switching",
      truncated: false,
    },
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

  it("prefers an explicit title over the first-message preview", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSessionProvider
        session={{
          ...session,
          activeSession: {
            ...session.activeSession!,
            title: "Session titles",
          },
        }}
      >
        <SessionPill />
      </WorkspaceSessionProvider>,
    );

    expect(html).toContain("Session titles");
    expect(html).not.toContain("Investigate session switching");
  });

  it("owns the empty-session fallback copy", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSessionProvider
        session={{
          ...session,
          activeSession: {
            sessionId: "session-2",
            createdAt: "2026-07-22T12:00:00.000Z",
            modifiedAt: "2026-07-22T12:00:00.000Z",
          },
        }}
      >
        <SessionPill />
      </WorkspaceSessionProvider>,
    );

    expect(html).toContain("New conversation");
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
