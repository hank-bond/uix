import type { Logger } from "pino";
import { describe, expect, it } from "vitest";

import { recordWireCrossing } from "./ipc-wire-log";

function captureLogger() {
  const entries: unknown[] = [];
  const write = (fields: unknown, message: string) => {
    entries.push({ fields, message });
  };
  return {
    entries,
    logger: {
      info: write,
      debug: write,
      trace: write,
    } as unknown as Logger,
  };
}

describe("IPC wire logging", () => {
  it("records redacted descriptions in terminal and file logs", () => {
    const terminal = captureLogger();
    const file = captureLogger();
    const secret = "test-secret-authorization-code";

    recordWireCrossing(
      { terminal: terminal.logger, file: file.logger },
      "result:agent.auth_response",
      { code: secret },
      { describe: () => ({ redacted: "provider authentication response" }) },
    );

    expect(JSON.stringify(terminal.entries)).not.toContain(secret);
    expect(JSON.stringify(file.entries)).not.toContain(secret);
    expect(terminal.entries).toEqual(file.entries);
    expect(terminal.entries).toContainEqual({
      fields: { payload: { redacted: "provider authentication response" } },
      message: "result:agent.auth_response",
    });
  });

  it("redacts authorization URLs and device codes while preserving crossings", () => {
    const terminal = captureLogger();
    const file = captureLogger();
    const authorizationUrl = "https://provider.example/auth?code=device-secret";

    recordWireCrossing(
      { terminal: terminal.logger, file: file.logger },
      "out:agent.auth_flow",
      { authorizationUrl, deviceCode: "device-secret" },
      { describe: () => ({ redacted: "provider authentication event" }) },
    );

    const logs = JSON.stringify([terminal.entries, file.entries]);
    expect(logs).not.toContain(authorizationUrl);
    expect(logs).not.toContain("device-secret");
    expect(terminal.entries).toHaveLength(1);
    expect(file.entries).toHaveLength(1);
  });

  it("records raw payloads by default", () => {
    const terminal = captureLogger();
    const payload = { key: "ordinary-value" };

    recordWireCrossing(
      { terminal: terminal.logger },
      "in:canvas.refresh",
      payload,
    );

    expect(terminal.entries).toContainEqual({
      fields: { payload },
      message: "in:canvas.refresh",
    });
  });
});
