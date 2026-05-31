// Trellis lint config (ESLint flat config).
//
// Two layers of rules:
//
//   1. Standard hygiene from @eslint/js + typescript-eslint
//      (recommended + recommended-type-checked). Catches the usual
//      "unused var" / "no-floating-promises" / "no-misused-promises"
//      class of bugs without us having to enumerate them.
//
//   2. Project-specific enforcement of conventions documented in
//      docs/conventions.md:
//        - lifecycle helpers are mandatory (no raw `app.on`,
//          `ipcMain.handle`, `process.on` outside `lifecycle.ts`)
//        - logging goes through `createLogger`, not `console.*`
//          (in the main process only — renderer/preload don't have
//          a logging story yet)
//        - Node built-in globals are imported explicitly, never
//          accessed as ambient globals
//
// Prettier handles formatting and is layered last so its rule
// disables win over anything stylistic.

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "out/**",
      "dist/**",
      "node_modules/**",
      ".trellis/**",
      "*.tsbuildinfo",
    ],
  },

  // Base recommended rules from ESLint core.
  js.configs.recommended,

  // TypeScript-aware rules. The `recommendedTypeChecked` set turns on
  // rules that need access to the type checker (no-floating-promises,
  // no-misused-promises, no-unsafe-* on `any`, etc.). Slower than the
  // non-type-checked set, but the bugs it catches are worth it.
  ...tseslint.configs.recommendedTypeChecked,

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
            "Import process from 'node:process' instead of using the global. See docs/conventions.md > Imports.",
        },
        {
          name: "Buffer",
          message:
            "Import Buffer from 'node:buffer' instead of using the global.",
        },
      ],

      // Force lifecycle helpers for known event-emitter APIs.
      // Selectors detect named bindings; instance-method calls on a
      // window or driver variable aren't catchable from AST alone, so
      // those rely on review + the helper-is-easier-than-disabling
      // pattern. lifecycle.ts itself is excepted below.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='app'][callee.property.name=/^(on|off|once|addListener|removeListener|prependListener|prependOnceListener)$/]",
          message:
            "Use onApp() from src/main/lifecycle.ts instead of app.on / app.off. See docs/conventions.md.",
        },
        {
          selector:
            "CallExpression[callee.object.name='ipcMain'][callee.property.name=/^(handle|handleOnce|on|once|removeHandler|removeListener)$/]",
          message:
            "Use handle() from src/main/lifecycle.ts instead of ipcMain.handle / ipcMain.on. See docs/conventions.md.",
        },
        {
          selector:
            "CallExpression[callee.object.name='process'][callee.property.name=/^(on|off|once|addListener|removeListener|prependListener|prependOnceListener)$/]",
          message:
            "Use installProcessHandlers() from src/main/lifecycle.ts instead of process.on directly. See docs/conventions.md.",
        },
      ],

      // Logging convention: pino via createLogger, not console.*.
      // Scoped to the main process; renderer/preload get an override
      // below until they have a logging story.
      "no-console": "error",

      // Async hygiene — these come from recommendedTypeChecked but
      // I'm calling them out explicitly because they're the rules
      // that earn the type-checker cost.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

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

  // lifecycle.ts IS the helper layer; it's allowed to call the raw
  // APIs the rules above ban for everyone else.
  {
    files: ["src/main/lifecycle.ts"],
    rules: {
      "no-restricted-syntax": "off",
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
    files: ["eslint.config.mjs", "*.config.ts", "*.config.mjs", "*.config.js"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "no-console": "off",
    },
  },

  // Prettier last — disables stylistic rules that would fight the
  // formatter.
  prettier,
);
