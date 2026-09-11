import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
  type AgentToolResult,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionContext,
  type ReadToolInput,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspaceToolOverrideContributions } from "./agent-tools";
import { createQueuedReadOperations } from "./queued-read";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    access: vi.fn(actual.access),
  };
});

const Png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(join(tmpdir(), "uix-queued-read-"));
});

afterEach(async () => {
  vi.resetAllMocks();
  await fs.rm(cwd, { recursive: true, force: true });
});

function read(
  args: ReadToolInput,
  signal?: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const contribution = createWorkspaceToolOverrideContributions().find(
    (tool) => tool.name === "read",
  );
  if (!contribution) throw new Error("Missing read override");
  return contribution.tool.execute(
    "read",
    { ...args, reason: "Check coordinated reads." },
    signal,
    undefined,
    { cwd } as ExtensionContext,
  );
}

function gate(): { promise: Promise<void>; resolve: () => void } {
  let release: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    resolve: () => {
      release();
    },
  };
}

describe("queued workspace reads", () => {
  it.each([
    { name: "text", bytes: Buffer.from("first\nsecond\nthird\n"), range: {} },
    {
      name: "range",
      bytes: Buffer.from("first\nsecond\nthird\n"),
      range: { offset: 2, limit: 1 },
    },
    { name: "empty", bytes: Buffer.from(""), range: {} },
    {
      name: "line truncation",
      bytes: Buffer.from("row\n".repeat(3000)),
      range: {},
    },
    {
      name: "byte truncation",
      bytes: Buffer.from("x".repeat(60_000)),
      range: {},
    },
    { name: "image without image extension", bytes: Png, range: {} },
  ])("preserves Pi's $name result", async ({ bytes, range }) => {
    await fs.writeFile(join(cwd, "fixture"), bytes);
    const args = { path: "fixture", ...range };
    const baseline = await createReadToolDefinition(cwd).execute(
      "baseline",
      args,
      undefined,
      undefined,
      { cwd } as ExtensionContext,
    );
    expect(await read(args)).toEqual(baseline);
  });

  it("leaves filename resolution to Pi", async () => {
    const target = join(cwd, "notes.txt");
    await fs.writeFile(target, "notes");
    await fs.symlink(target, join(cwd, "alias.txt"));
    await fs.writeFile(join(cwd, "Shot 10.00.00\u202fPM.txt"), "notes");
    for (const path of [
      "notes.txt",
      "@notes.txt",
      target,
      `~/${relative(homedir(), target)}`,
      "alias.txt",
      "Shot 10.00.00 PM.txt",
    ]) {
      expect((await read({ path })).content).toEqual([
        { type: "text", text: "notes" },
      ]);
    }
  });

  it("takes a fresh snapshot for each call, not a file cache", async () => {
    const path = join(cwd, "notes.txt");
    await fs.writeFile(path, "before");
    expect((await read({ path })).content).toEqual([
      { type: "text", text: "before" },
    ]);
    await fs.writeFile(path, "after");
    expect((await read({ path })).content).toEqual([
      { type: "text", text: "after" },
    ]);
  });

  it("keeps MIME and bytes from the same captured version", async () => {
    const path = join(cwd, "image.bin");
    await fs.writeFile(path, Png);
    const ops = createQueuedReadOperations(undefined);
    await ops.access(path);
    await createWriteToolDefinition(cwd).execute(
      "write",
      { path, content: "now text" },
      undefined,
      undefined,
      { cwd } as ExtensionContext,
    );
    expect(await ops.detectImageMimeType?.(path)).toBe("image/png");
    expect(await ops.readFile(path)).toEqual(Png);
  });

  it("waits for a baseline edit through a symlink, while another file stays parallel", async () => {
    const path = join(cwd, "notes.txt");
    const alias = join(cwd, "alias.txt");
    const other = join(cwd, "other.txt");
    await fs.writeFile(path, "before");
    await fs.symlink(path, alias);
    await fs.writeFile(other, "independent");
    const truncated = gate();
    const release = gate();
    const edit = createEditToolDefinition(cwd, {
      operations: {
        access: (path) => fs.access(path, constants.R_OK | constants.W_OK),
        readFile: (path) => fs.readFile(path),
        async writeFile(path, content) {
          await fs.writeFile(path, "");
          truncated.resolve();
          await release.promise;
          await fs.writeFile(path, content);
        },
      },
    });
    const editing = edit.execute(
      "edit",
      { path, edits: [{ oldText: "before", newText: "after" }] },
      undefined,
      undefined,
      { cwd } as ExtensionContext,
    );
    await truncated.promise;
    const ops = createQueuedReadOperations(undefined);
    const reading = ops.access(alias);
    try {
      expect((await read({ path: other })).content).toEqual([
        { type: "text", text: "independent" },
      ]);
      expect(fs.access).not.toHaveBeenCalledWith(alias, constants.R_OK);
    } finally {
      release.resolve();
      await editing;
    }
    await reading;
    expect(await ops.readFile(alias)).toEqual(Buffer.from("after"));
  });

  it("skips filesystem work when cancelled while queued", async () => {
    const path = join(cwd, "notes.txt");
    await fs.writeFile(path, "notes");
    const entered = gate();
    const release = gate();
    const blocker = withFileMutationQueue(path, async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const controller = new AbortController();
    const ops = createQueuedReadOperations(controller.signal);
    const result = ops.access(path);
    const rejected = expect(result).rejects.toThrow();
    controller.abort();
    release.resolve();
    await blocker;
    await rejected;
    expect(fs.access).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("does not release the queue when Pi reports cancellation before the read settles", async () => {
    const path = join(cwd, "notes.txt");
    await fs.writeFile(path, "before");
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    const started = gate();
    const release = gate();
    vi.mocked(fs.readFile).mockImplementationOnce(async (path) => {
      started.resolve();
      await release.promise;
      return actual.readFile(path);
    });
    const controller = new AbortController();
    const reading = read({ path }, controller.signal);
    const rejected = expect(reading).rejects.toThrow("Operation aborted");
    await started.promise;
    controller.abort();
    await rejected;
    let editStarted = false;
    const editing = createEditToolDefinition(cwd, {
      operations: {
        async access(path) {
          editStarted = true;
          await actual.access(path);
        },
        readFile: (path) => actual.readFile(path),
        writeFile: (path, content) => actual.writeFile(path, content),
      },
    }).execute(
      "edit",
      { path, edits: [{ oldText: "before", newText: "after" }] },
      undefined,
      undefined,
      { cwd } as ExtensionContext,
    );
    try {
      // Pi registers queue entries in FIFO order. This unrelated entry confirms
      // that the following edit has registered without waiting for its body.
      await withFileMutationQueue(join(cwd, "barrier"), () =>
        Promise.resolve(),
      );
      expect(editStarted).toBe(false);
    } finally {
      release.resolve();
      await editing;
    }
    expect(await actual.readFile(path, "utf8")).toBe("after");
  });

  it("releases the queue after a filesystem error", async () => {
    const path = join(cwd, "missing.txt");
    await expect(read({ path })).rejects.toThrow();
    await createWriteToolDefinition(cwd).execute(
      "write",
      { path, content: "created" },
      undefined,
      undefined,
      { cwd } as ExtensionContext,
    );
    expect((await read({ path })).content).toEqual([
      { type: "text", text: "created" },
    ]);
  });
});
