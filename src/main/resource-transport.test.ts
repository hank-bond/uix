import { describe, expect, it } from "vitest";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";

import { registerResourceProtocol } from "./resource-transport";

describe("registerResourceProtocol", () => {
  it("registers the substrate resource protocol", () => {
    const registered: Electron.CustomScheme[][] = [];

    registerResourceProtocol((schemes) => registered.push(schemes));

    expect(registered).toEqual([
      [
        {
          scheme: ResourceProtocolScheme,
          privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
          },
        },
      ],
    ]);
  });
});
