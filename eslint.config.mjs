import angularTemplatePlugin from '@angular-eslint/eslint-plugin-template';
import angularEslintTemplate from '@angular-eslint/template-parser';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'packages/**/dist/',
      'packages/**/coverage/',
      'apps/web/dist/',
      'apps/web/coverage/',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Promise safety. These catch dropped async work and async handlers
      // passed where a void callback is expected.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksConditionals: true,
          checksSpreads: true,
          checksVoidReturn: true,
        },
      ],

      // TypeScript correctness baseline. Type-level strictness is enforced by
      // the compiler (strict, noUnusedLocals, noUncheckedIndexedAccess, etc.).
      '@typescript-eslint/no-dupe-class-members': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-loss-of-precision': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-var-requires': 'error',

      // Runtime correctness rules.
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'no-unsafe-finally': 'error',
      'valid-typeof': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-async-promise-executor': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: angularEslintTemplate,
    },
    plugins: {
      '@angular-eslint/template': angularTemplatePlugin,
    },
    rules: {
      // Angular template correctness and accessibility checks.
      '@angular-eslint/template/alt-text': 'error',
      '@angular-eslint/template/banana-in-box': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'error',
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/label-has-associated-control': 'error',
      '@angular-eslint/template/mouse-events-have-key-events': 'error',
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/no-autofocus': 'error',
      '@angular-eslint/template/no-call-expression': 'error',
      '@angular-eslint/template/no-distracting-elements': 'error',
      '@angular-eslint/template/no-duplicate-attributes': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/no-positive-tabindex': 'error',
      '@angular-eslint/template/role-has-required-aria': 'error',
      '@angular-eslint/template/table-scope': 'error',
      '@angular-eslint/template/use-track-by-function': 'error',
      '@angular-eslint/template/valid-aria': 'error',
    },
  },
];
