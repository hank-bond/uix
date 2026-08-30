import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseServerArguments,
  renderServerHelp,
  resolveServerConfiguration,
} from "./configuration";

describe("server configuration", () => {
  it("resolves loopback defaults from the process working directory", () => {
    expect(
      resolveServerConfiguration({
        environment: {},
        cwd: "/private/server",
      }),
    ).toEqual({
      profile: "loopback",
      hostAddress: "127.0.0.1",
      port: 3000,
      registryPath: join("/private/server", "server.workspaces.json"),
      piAppDataDir: join("/private/server", ".uix-server", "pi"),
      publicOrigin: "http://127.0.0.1:3000",
    });
  });

  it("normalizes declared overrides while ignoring unrelated process variables", () => {
    expect(
      resolveServerConfiguration({
        environment: {
          HOME: "/private/home",
          UIX_SERVER_PROFILE: "tls",
          UIX_SERVER_HOST: "0.0.0.0",
          UIX_SERVER_PORT: "4312",
          UIX_SERVER_REGISTRY: "config/workspaces.json",
          UIX_SERVER_DATA_DIR: "/var/lib/uix",
          UIX_PUBLIC_ORIGIN: "https://uix.example/",
        },
        cwd: "/private/server",
      }),
    ).toEqual({
      profile: "tls",
      hostAddress: "0.0.0.0",
      port: 4312,
      registryPath: join("/private/server", "config/workspaces.json"),
      piAppDataDir: join("/var/lib/uix", "pi"),
      publicOrigin: "https://uix.example",
    });
  });

  it("rejects invalid normalized values", () => {
    expect(() =>
      resolveServerConfiguration({
        environment: { UIX_SERVER_PORT: "70000" },
        cwd: "/private/server",
      }),
    ).toThrow("Invalid UIX_SERVER_PORT: 70000");

    expect(() =>
      resolveServerConfiguration({
        environment: { UIX_PUBLIC_ORIGIN: "file:///private/server" },
        cwd: "/private/server",
      }),
    ).toThrow("Public origin must use HTTP or HTTPS");
  });

  it("reports the environment schema when a declared raw value is invalid", () => {
    expect(() =>
      resolveServerConfiguration({
        environment: { UIX_SERVER_REGISTRY: "" },
        cwd: "/private/server",
      }),
    ).toThrow("Invalid server environment configuration. Schema:");
  });

  it("requires explicit safe profiles for non-loopback deployment", () => {
    expect(() =>
      resolveServerConfiguration({
        environment: { UIX_SERVER_HOST: "0.0.0.0" },
        cwd: "/private/server",
      }),
    ).toThrow(
      "Non-loopback binding requires UIX_SERVER_PROFILE and UIX_PUBLIC_ORIGIN",
    );

    expect(
      resolveServerConfiguration({
        environment: {
          UIX_SERVER_PROFILE: "trusted-network",
          UIX_SERVER_HOST: "100.64.0.8",
          UIX_PUBLIC_ORIGIN: "http://uix.tailnet.example:4312",
        },
        cwd: "/private/server",
      }),
    ).toMatchObject({
      profile: "trusted-network",
      hostAddress: "100.64.0.8",
      publicOrigin: "http://uix.tailnet.example:4312",
    });

    expect(() =>
      resolveServerConfiguration({
        environment: {
          UIX_SERVER_PROFILE: "trusted-network",
          UIX_SERVER_HOST: "100.64.0.8",
          UIX_PUBLIC_ORIGIN: "https://uix.example",
        },
        cwd: "/private/server",
      }),
    ).toThrow("trusted-network profile requires a plaintext HTTP");

    expect(() =>
      resolveServerConfiguration({
        environment: {
          UIX_SERVER_PROFILE: "tls",
          UIX_SERVER_HOST: "0.0.0.0",
          UIX_PUBLIC_ORIGIN: "http://uix.example",
        },
        cwd: "/private/server",
      }),
    ).toThrow("tls profile requires an HTTPS");
  });

  it("parses help and rejects unsupported command-line arguments", () => {
    expect(parseServerArguments([])).toBe("start");
    expect(parseServerArguments(["--help"])).toBe("help");
    expect(parseServerArguments(["-h"])).toBe("help");
    expect(() => parseServerArguments(["--port", "4000"])).toThrow(
      "Unknown server argument: --port 4000",
    );
  });

  it("renders environment help from the declared schema metadata", () => {
    const help = renderServerHelp();

    expect(help).toContain("Usage: npm run start:server [-- --help]");
    expect(help).toContain("UIX_SERVER_PROFILE=<PROFILE>");
    expect(help).toContain("Default: loopback.");
    expect(help).toContain("UIX_SERVER_HOST=<HOST>");
    expect(help).toContain("Default: 127.0.0.1.");
    expect(help).toContain("UIX_SERVER_PORT=<PORT>");
    expect(help).toContain("Default: 3000.");
    expect(help).toContain("UIX_SERVER_REGISTRY=<PATH>");
    expect(help).toContain("Default: server.workspaces.json.");
    expect(help).toContain("UIX_SERVER_DATA_DIR=<PATH>");
    expect(help).toContain("Default: .uix-server.");
    expect(help).toContain("UIX_PUBLIC_ORIGIN=<ORIGIN>");
    expect(help).toContain("Browser-visible HTTP(S) origin");
    expect(help).not.toContain("<VALUE>");
  });
});
