import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertSourceBoundary,
  collectSourceDirectory,
  parseSourceSummary,
  renderSourceIndex,
} from "./docs-index.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("parseSourceSummary", () => {
  it("reads summaries from each supported source format", () => {
    expect(
      parseSourceSummary("tool.mjs", "// Coordinates repository checks.\n"),
    ).toBe("Coordinates repository checks.");
    expect(
      parseSourceSummary("styles.css", "/* Defines workspace layout. */\n"),
    ).toBe("Defines workspace layout.");
    expect(
      parseSourceSummary(
        "index.html",
        "<!-- Hosts the workspace renderer. -->\n",
      ),
    ).toBe("Hosts the workspace renderer.");
  });

  it("rejects a summary below the first line", () => {
    expect(() =>
      parseSourceSummary("second-line.ts", "\n// Describes the second line.\n"),
    ).toThrow("second-line.ts: missing source summary");
  });

  it("rejects a supported source file without a summary", () => {
    expect(() =>
      parseSourceSummary("missing.ts", "export const value = 1;\n"),
    ).toThrow("missing.ts: missing source summary");
  });

  it("joins a wrapped slash summary across continuation lines", () => {
    expect(
      parseSourceSummary(
        "wrapped.ts",
        "// Coordinates repository checks and the\n// docs index from frontmatter.\n",
      ),
    ).toBe(
      "Coordinates repository checks and the docs index from frontmatter.",
    );
  });

  it("stops the summary at a blank separator line", () => {
    expect(
      parseSourceSummary(
        "two-part.ts",
        "// Coordinates repository checks.\n//\n// Elaboration follows.\n",
      ),
    ).toBe("Coordinates repository checks.");
  });

  it("ignores unsupported file formats", () => {
    expect(parseSourceSummary("package.json", "{}\n")).toBeUndefined();
  });
});

describe("source directory indexes", () => {
  it("rejects a boundary with only one production owner", () => {
    expect(() =>
      assertSourceBoundary("single", {
        directories: [],
        documents: [],
        files: [{ label: "only.ts", link: "./only.ts", summary: "Owns it." }],
      }),
    ).toThrow(
      "single/AGENTS.md: source boundary must route at least two production owners",
    );
  });

  it("collects production source files, local documentation, and indexed child directories", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "source-index-"));
    temporaryDirectories.push(repositoryRoot);
    const boundary = join(repositoryRoot, "boundary");
    const child = join(boundary, "child");
    mkdirSync(child, { recursive: true });

    writeFileSync(
      join(boundary, "behavior.ts"),
      "// Owns the boundary behavior.\n",
    );
    writeFileSync(
      join(boundary, "behavior.test.ts"),
      'import { test } from "vitest";\n',
    );
    writeFileSync(join(boundary, "package.json"), "{}\n");
    writeFileSync(
      join(boundary, "README.md"),
      "# Public project documentation\n",
    );
    writeFileSync(
      join(boundary, "guide.md"),
      '---\nsummary: "Explains the local coordination rule."\nkind: explanation\nstatus: active\n---\n\n# Guide\n',
    );
    writeFileSync(
      join(child, "AGENTS.md"),
      '---\nsummary: "Owns the child responsibility."\nstatus: active\n---\n\n# Child\n',
    );

    const entries = collectSourceDirectory(repositoryRoot, "boundary");
    expect(() => assertSourceBoundary("boundary", entries)).not.toThrow();
    expect(entries.directories.map(({ label }) => label)).toEqual(["child/"]);
    expect(entries.documents.map(({ label }) => label)).toEqual(["guide.md"]);
    expect(entries.documents.map(({ label }) => label)).not.toContain(
      "README.md",
    );
    expect(entries.files.map(({ label }) => label)).toEqual(["behavior.ts"]);
    expect(renderSourceIndex(entries)).not.toContain("behavior.test.ts");

    expect(renderSourceIndex(entries)).toContain(
      "### Directories\n\n- **[child/](./child/AGENTS.md)** _(active)._ Owns the child responsibility.",
    );
    expect(renderSourceIndex(entries)).toContain(
      "### Local documentation\n\n- **[guide.md](./guide.md)** _(active, explanation)._ Explains the local coordination rule.",
    );
    expect(renderSourceIndex(entries)).toContain(
      "### Source files\n\n- **[behavior.ts](./behavior.ts)** Owns the boundary behavior.",
    );
  });
});
