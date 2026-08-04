// UIX lint config (ESLint flat config).
//
// Two layers of rules:
//
//   1. Standard hygiene from @eslint/js + typescript-eslint
//      (recommended + recommended-type-checked). Catches the usual
//      "unused var" / "no-floating-promises" / "no-misused-promises"
//      class of bugs without us having to enumerate them.
//
//   2. Project-specific enforcement of conventions documented in
//      docs/architecture/conventions/:
//        - lifecycle helpers are mandatory (no raw `app.on`,
//          `process.on` outside `lifecycle.ts`), and the IPC boundary
//          is mandatory (no raw `ipcMain.handle`, `webContents.send`
//          outside `ipc.ts`)
//        - logging goes through `createLogger` with structured fields and a
//          stable event id (in the main process only — renderer/preload don't
//          have a logging story yet)
//        - Node built-ins use explicit `node:` imports
//        - production feature modules do not import host internals
//        - React hooks obey call-order and dependency rules
//
// Prettier handles formatting and is layered last so its rule
// disables win over anything stylistic.

import { builtinModules } from "node:module";

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const bareNodeBuiltinImports = builtinModules
  .filter((name) => !name.startsWith("node:"))
  .map((name) => ({
    name,
    message: `Import ${name} through the node: prefix. See docs/architecture/conventions/module-boundaries.md.`,
  }));

const appEventRestriction = {
  selector:
    "CallExpression[callee.object.name='app'][callee.property.name=/^(on|off|once|addListener|removeListener|prependListener|prependOnceListener)$/]",
  message:
    "Use onApp() from src/main/lifecycle.ts instead of app.on / app.off. See docs/architecture/conventions/lifetimes.md.",
};
const ipcMainRestriction = {
  selector:
    "CallExpression[callee.object.name='ipcMain'][callee.property.name=/^(handle|handleOnce|on|once|removeHandler|removeListener)$/]",
  message:
    "Use handle() from src/main/ipc.ts instead of ipcMain.handle / ipcMain.on. See docs/architecture/conventions/lifetimes.md.",
};
const webContentsSendRestriction = {
  selector:
    "CallExpression[callee.object.property.name='webContents'][callee.property.name=/^(send|postMessage)$/]",
  message:
    "Use send() from src/main/ipc.ts instead of webContents.send, so the crossing lands in the wire log. See docs/architecture/conventions/lifetimes.md.",
};
const processEventRestriction = {
  selector:
    "CallExpression[callee.object.name='process'][callee.property.name=/^(on|off|once|addListener|removeListener|prependListener|prependOnceListener)$/]",
  message:
    "Use installProcessHandlers() from src/main/lifecycle.ts instead of process.on directly. See docs/architecture/conventions/lifetimes.md.",
};
const publicMemberModifierRestriction = {
  selector:
    "MethodDefinition[accessibility='public'], PropertyDefinition[accessibility='public']",
  message:
    "Do not write the `public` modifier on class members — they are public by default. Non-readonly constructor parameter properties may be explicit.",
};
const recordConstraintRestriction = {
  selector: "TSTypeParameter > TSTypeReference[typeName.name=Record]",
  message:
    "Do not constrain a generic with `extends Record<...>` — the index-signature requirement silently rejects interface-based types (and intersections containing them), breaking inference at call sites. Use `extends object` unless a string index signature is genuinely required.",
};

const LogLevels = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);
const EventIdPattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const uixLintPlugin = {
  rules: {
    "no-default-export": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Ban default exports — the loading contract uses named exports (`feature` entries, `surface` modules).",
        },
        schema: [],
        messages: {
          default:
            "No default exports — export named symbols. Feature entries export `feature`, surface modules export `surface`.",
        },
      },
      create(context) {
        return {
          ExportDefaultDeclaration(node) {
            context.report({ node, messageId: "default" });
          },
          ExportNamedDeclaration(node) {
            for (const spec of node.specifiers ?? []) {
              if (
                spec.type === "ExportSpecifier" &&
                spec.exported.type === "Identifier" &&
                spec.exported.name === "default"
              ) {
                context.report({ node: spec, messageId: "default" });
              }
            }
          },
        };
      },
    },
    "require-export": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require a module to export a named contract symbol (feature entries export `feature`, surface modules export `surface`).",
        },
        schema: [
          {
            type: "object",
            properties: { name: { type: "string" } },
            additionalProperties: false,
          },
        ],
        messages: {
          missing:
            "This module must export `{{ name }}` (export const {{ name }} = defineFeature/defineSurface(...)).",
        },
      },
      create(context) {
        const name = context.options[0]?.name ?? "feature";
        const exported = new Set();
        const addExported = (id) => {
          if (id?.type === "Identifier") exported.add(id.name);
        };
        return {
          ExportNamedDeclaration(node) {
            if (node.declaration) {
              if (node.declaration.type === "VariableDeclaration") {
                for (const decl of node.declaration.declarations) {
                  addExported(decl.id);
                }
              } else {
                addExported(node.declaration.id);
              }
            }
            for (const spec of node.specifiers ?? []) {
              if (
                spec.type === "ExportSpecifier" &&
                spec.exported.type === "Identifier"
              ) {
                exported.add(spec.exported.name);
              }
            }
          },
          "Program:exit"(node) {
            if (!exported.has(name)) {
              context.report({ node, messageId: "missing", data: { name } });
            }
          },
        };
      },
    },
    "structured-log-call": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require main-process log calls to use fields plus a static snake-case event id.",
        },
        schema: [],
        messages: {
          shape:
            'Use the structured log shape log.<level>({ ...fields }, "event_name").',
          event:
            "Use a static lowercase snake_case event identifier as the second argument.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type !== "MemberExpression" ||
              node.callee.computed ||
              node.callee.property.type !== "Identifier" ||
              !LogLevels.has(node.callee.property.name)
            ) {
              return;
            }
            if (node.arguments.length !== 2) {
              context.report({ node, messageId: "shape" });
              return;
            }
            const event = node.arguments[1];
            if (
              event.type !== "Literal" ||
              typeof event.value !== "string" ||
              !EventIdPattern.test(event.value)
            ) {
              context.report({ node: event, messageId: "event" });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      "out/**",
      "dist/**",
      "node_modules/**",
      ".uix/**",
      ".pi/**",
      "website/**",
      "*.tsbuildinfo",
    ],
  },

  // Base recommended rules from ESLint core.
  js.configs.recommended,

  // TypeScript-aware rules. The `strictTypeChecked` set turns on rules
  // that need access to the type checker (no-floating-promises,
  // no-misused-promises, no-unsafe-* on `any`, no-non-null-assertion,
  // no-unnecessary-condition, etc.). Slower than the non-type-checked
  // set, but the bugs it catches are worth it.
  ...tseslint.configs.strictTypeChecked,

  // Project-wide language and parser config.
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Project conventions.
  {
    rules: {
      // Explicit `node:` imports for Node built-ins. The rule turns the
      // ambient globals into errors so the import is the only path.
      // `__dirname` / `__filename` are intentionally NOT restricted:
      // they're CJS module-level bindings, not importable values, and
      // banning them just fights the bundle format. Use them where
      // appropriate (electron-vite emits CJS for main).
      "no-restricted-globals": [
        "error",
        {
          name: "process",
          message:
            "Import process from 'node:process' instead of using the global. See docs/architecture/conventions/module-boundaries.md.",
        },
        {
          name: "Buffer",
          message:
            "Import Buffer from 'node:buffer' instead of using the global.",
        },
      ],
      "no-restricted-imports": ["error", { paths: bareNodeBuiltinImports }],

      // Force the lifecycle helpers and the ipc boundary for known
      // event-emitter APIs. Selectors detect named bindings (plus the
      // `*.webContents.send` shape); other instance-method calls on a
      // window or driver variable aren't catchable from AST alone, so
      // those rely on review + the helper-is-easier-than-disabling
      // pattern. lifecycle.ts and ipc.ts receive narrow overrides below.
      "no-restricted-syntax": [
        "error",
        appEventRestriction,
        ipcMainRestriction,
        webContentsSendRestriction,
        processEventRestriction,
        publicMemberModifierRestriction,
        recordConstraintRestriction,
      ],

      // Logging convention: pino via createLogger, not console.*.
      // Scoped to the main process; renderer/preload get an override
      // below until they have a logging story.
      "no-console": "error",

      // Async hygiene — these come from strictTypeChecked but
      // I'm calling them out explicitly because they're the rules
      // that earn the type-checker cost.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Deprecated API usage is an error, not a warning: a deprecation
      // that reaches the codebase is a debt we've already accrued. This
      // is the rule this repo flipped on deliberately.
      "@typescript-eslint/no-deprecated": "error",

      // Loosen a couple of recommended rules that fight the codebase
      // without much payoff.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Language-feature hygiene, the mechanically enforceable residue of the
  // absorbed TS style guide. Deliberately NOT adopted from that guide:
  // single quotes (Prettier owns quote style; the repo formats double) and
  // the `#private`-field ban (`#` is the repo's encapsulation mechanism for
  // stateful classes — the ES2022 target emits it natively with zero
  // downlevel cost, and engine enforcement beats the type-only `private`
  // keyword; variation between classes routes through injection, not
  // subclassing).
  {
    rules: {
      // Google's exception form: `== null` covers both null and undefined.
      eqeqeq: ["error", "smart"],
      // Braces on multi-line control-flow bodies; single-line `if (x) y();`
      // may elide the block, matching the style guide's exception.
      curly: ["error", "multi-line"],
      "one-var": ["error", "never"],
      "guard-for-in": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-new-wrappers": "error",
      "default-case-last": "error",
      radix: "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      // `const enum` is already a compile error under `isolatedModules`.
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/no-invalid-this": "error",
    },
  },

  // Type-system hygiene, the mechanically enforceable residue of the absorbed
  // TS style guide's type chapter. Deliberately NOT adopted from that guide:
  // the mapped/conditional-type simplicity rule — mapped types are the
  // contract-derivation mechanism here (ChannelHandlers, FeatureEventPublisher,
  // SettingsHandleFrom), while fixed shapes are still spelled out rather than
  // derived. Judgment-tier rules (annotation choices, nullable-alias style)
  // stay in review.
  {
    rules: {
      // Interfaces for object shapes; type aliases stay for unions, tuples,
      // and computed types.
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      // T[] sugar for simple element types; Array<T> for complex ones.
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      // String/Number/Boolean/Object as type annotations (not coercion calls).
      "@typescript-eslint/no-wrapper-object-types": "error",
      // Named functions and methods carry return types; callbacks and
      // expressions infer. Locked in because the codebase already annotates
      // ~99% — the rule surfaces future return-type changes at the definition
      // site instead of at callers.
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowIIFEs: true,
        },
      ],
    },
  },

  // Main-process logs use one mechanically checkable shape. IPC wire logs are
  // excepted below because their message identifies a dynamic channel crossing.
  {
    files: ["src/main/**/*.ts"],
    plugins: { uix: uixLintPlugin },
    rules: {
      "uix/structured-log-call": "error",
    },
  },
  {
    files: ["src/main/ipc.ts", "src/main/ipc-wire-log.ts"],
    rules: {
      "uix/structured-log-call": "off",
    },
  },

  // Boundary modules may call only the raw APIs they encapsulate. Keep the
  // other restrictions active so one helper layer cannot absorb another's role.
  {
    files: ["src/main/lifecycle.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ipcMainRestriction,
        webContentsSendRestriction,
      ],
    },
  },
  {
    files: ["src/main/ipc.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        appEventRestriction,
        processEventRestriction,
      ],
    },
  },

  // Features depend on the injected API, not host implementation modules.
  // White-box integration tests are outside the loadable feature boundary and
  // retain explicit access to the subsystem they exercise.
  {
    files: ["src/features/**/*.{ts,tsx}"],
    ignores: ["src/features/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...bareNodeBuiltinImports,
            {
              name: "node:process",
              message:
                "Feature runtime environment capabilities belong in the injected FeatureContext.",
            },
          ],
          patterns: [
            {
              group: ["#backend", "#backend/*", "**/main/**"],
              message:
                "Features must use @uix/api and injected context instead of importing host internals.",
            },
          ],
        },
      ],
    },
  },

  // The loading contract bans default exports in source and templates: feature
  // entries export `feature`, surface modules export `surface`. Ambient .d.ts
  // declarations keep default exports (CSS module typing).
  {
    files: ["src/**/*.{ts,tsx}", "templates/**/*.{ts,tsx}"],
    plugins: { uix: uixLintPlugin },
    rules: {
      "uix/no-default-export": "error",
    },
  },
  {
    files: ["src/**/*.d.ts"],
    rules: {
      "uix/no-default-export": "off",
    },
  },
  // Feature entries and surface modules must export the name their loader
  // reads: `feature` (jiti in main), `surface` (vite dynamic import in the
  // renderer).
  {
    files: [
      "src/features/*/index.ts",
      "templates/workspace/features/*/index.ts",
    ],
    plugins: { uix: uixLintPlugin },
    rules: {
      "uix/require-export": ["error", { name: "feature" }],
    },
  },
  {
    files: ["src/features/*/workspace/surface.tsx"],
    plugins: { uix: uixLintPlugin },
    rules: {
      "uix/require-export": ["error", { name: "surface" }],
    },
  },

  // Hooks can live in .ts as well as .tsx, so apply both correctness rules to
  // all source modules rather than only renderer components.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Renderer + preload don't have a logging story yet, and they run
  // in the browser context (no `process` etc.). Keep them light.
  {
    files: ["src/renderer/**", "src/preload/**"],
    rules: {
      "no-console": "off",
      "no-restricted-globals": "off",
    },
  },

  // Config files (this file, vite configs, etc.) sit outside the
  // tsconfig project graph, so type-aware rules can't analyse them.
  // Disable the type-checked ruleset there (the spread brings in
  // both the rule-disables and the parser settings) and merge our
  // own loosenings on top.
  {
    files: [
      "eslint.config.mjs",
      "*.config.ts",
      "*.config.mjs",
      "*.config.js",
      "scripts/**/*.mjs",
      "scripts/**/*.js",
    ],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "no-console": "off",
      // Plain JS has no type annotations; return types cannot be written.
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },

  // Import/export ordering — mechanical and autofixed. Regex groups in order:
  // side-effect imports first (main.tsx's provide-shared-modules is
  // load-bearing), then `node:` builtins, then external packages, then
  // project aliases (@uix/*, #*), then relative imports. Groups are
  // blank-line separated; within a group imports sort alphabetically.
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^\\u0000"],
            ["^node:"],
            ["^(?!@uix/|#)[^./]"],
            ["^@uix/", "^#"],
            ["^\\./", "^\\.\\./"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },

  // Prettier last — disables stylistic rules that would fight the
  // formatter.
  prettier,
);
