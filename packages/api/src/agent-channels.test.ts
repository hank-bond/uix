import { afterEach, describe, expect, it, vi } from "vitest";

import { createClientMutationId } from "./agent-channels";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client mutation identity", () => {
  it("uses random bytes without requiring secure-context randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array): Uint8Array {
        bytes.forEach((_byte, index) => {
          bytes[index] = index;
        });
        return bytes;
      },
    });

    expect(createClientMutationId()).toBe("000102030405060708090a0b0c0d0e0f");
  });
});
