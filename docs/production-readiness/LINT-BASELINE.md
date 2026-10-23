# ESLint Baseline

**Status:** active gate — `npm run lint` passes with zero errors and zero warnings  
**Updated:** 2026-10-23

## What was broken

The original `eslint.config.mjs` could not start:

- It referenced `@angular-eslint/click-events-have-key-events`, but the rule lives on the
  template plugin as `@angular-eslint/template/click-events-have-key-events`.
- `@angular-eslint/eslint-plugin-template` was not installed.
- Several configured rule names did not exist in the installed Angular ESLint 19 plugin
  (`contextualize-blur`, `interpolation-whitespace`, `lifecycle-hooks`, `no-blank`,
  `no-safe-navigation`, `no-srcset`, `outline-on-focus`, `tabindex-zero-warning`, and others).
- The HTML block registered the TypeScript plugin as `@angular-eslint`, while using
  `@angular-eslint/template/*` rule namespaces.
- `packages/protocol/tests/protocol.spec.ts` and `packages/canvas-engine/vitest.config.ts`
  were outside every configured TypeScript project, causing parser errors.

## Current configuration

- `@angular-eslint/eslint-plugin-template` added as a dev dependency.
- TypeScript files are linted with `@typescript-eslint/parser` against
  `tsconfig.eslint.json`, which includes app sources, package sources, package tests, and
  `vitest.config.ts` files. This is the ESLint project only; `npm run typecheck` still uses
  the build tsconfigs.
- Angular HTML templates are linted with `@angular-eslint/template-parser` and the
  `@angular-eslint/template` plugin.
- `--max-warnings=0` remains in force.

### Enforced rules

TypeScript promise safety:

- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/no-misused-promises`

TypeScript correctness baseline:

- `no-dupe-class-members`, `no-duplicate-enum-values`, `no-duplicate-type-constituents`,
  `no-for-in-array`, `no-implied-eval`, `no-loss-of-precision`, `no-misused-new`,
  `no-unsafe-enum-comparison`, `no-unsafe-function-type`, `no-var-requires`

Runtime correctness:

- `no-duplicate-case`, `no-unreachable`, `no-constant-binary-expression`,
  `no-unsafe-finally`, `valid-typeof`, `no-fallthrough`, `no-self-assign`,
  `no-self-compare`, `no-unmodified-loop-condition`, `no-constant-condition`,
  `no-async-promise-executor`, `no-eval`, `no-new-func`, `no-script-url`

Angular template correctness and accessibility:

- `alt-text`, `banana-in-box`, `click-events-have-key-events`, `eqeqeq`,
  `interactive-supports-focus`, `label-has-associated-control`,
  `mouse-events-have-key-events`, `no-any`, `no-autofocus`, `no-call-expression`,
  `no-distracting-elements`, `no-duplicate-attributes`, `no-negated-async`,
  `no-positive-tabindex`, `role-has-required-aria`, `table-scope`,
  `use-track-by-function`, `valid-aria`

## Deferred strict rules

The previous rule list also enabled a large set of type-aware strictness rules that the
existing codebase does not satisfy. With valid rule names and the missing plugin installed,
that configuration reported roughly 1,169 findings across 83 files before any auto-fixes
(384 `strict-boolean-expressions`, ~200 `no-unsafe-*`, 75
`no-confusing-void-expression`, 64 `no-unnecessary-condition`, 63
`restrict-template-expressions`, and others). Applying the suggested fixes in memory
expanded the unsafe-access findings to several thousand, so enabling those rules now would
require a broad, riskier refactor rather than a baseline repair.

The following are intentionally **not enabled yet** and are tracked as incremental
hardening work, not silently suppressed per file:

- `@typescript-eslint/strict-boolean-expressions`
- `@typescript-eslint/no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-call`,
  `no-unsafe-member-access`, `no-unsafe-return`
- `@typescript-eslint/no-confusing-void-expression`
- `@typescript-eslint/no-unnecessary-condition`, `no-unnecessary-type-assertion`
- `@typescript-eslint/restrict-template-expressions`, `restrict-plus-operands`
- `@typescript-eslint/consistent-type-imports`, `prefer-readonly`,
  `explicit-function-return-type`, `explicit-member-accessibility`,
  `no-inferrable-types`, `no-explicit-any`

Type-level safety remains enforced by the compiler: `strict`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noUncheckedIndexedAccess`, and `noImplicitOverride` are all enabled in
`tsconfig.base.json`.

## Follow-up

Enable the deferred rules one family at a time, starting with
`consistent-type-imports` and `no-unnecessary-condition` on new or substantially modified
files, then promote each to the global config once its finding count reaches zero.
