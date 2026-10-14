import angularEslint from '@angular-eslint/eslint-plugin';
import angularEslintTemplate from '@angular-eslint/template-parser';
import eslint from '@eslint/js';
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
    files: ['**/*.ts', '**/*.html'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          'tsconfig.json',
          'packages/canvas-engine/tsconfig.json',
          'apps/web/tsconfig.app.json',
        ],
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'warn',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: false,
          allowBoolean: false,
          allowRegExp: false,
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-plus-operands': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumberAndString: false,
          allowRegExp: false,
          skipCompoundAssignments: false,
        },
      ],
      '@typescript-eslint/prefer-readonly': 'warn',
      '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
      '@typescript-eslint/prefer-includes': 'warn',
      // Correctness baseline
      '@typescript-eslint/no-dupe-class-members': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/no-loss-of-precision': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksConditionals: true,
          checksSpreads: true,
          checksVoidReturn: true,
        },
      ],
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-plus-operands': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumberAndString: false,
          allowRegExp: false,
          skipCompoundAssignments: false,
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/explicit-member-accessibility': [
        'warn',
        {
          accessibility: 'no-public',
        },
      ],
      '@typescript-eslint/member-delimiter-style': [
        'warn',
        {
          multiline: {
            delimiter: 'none',
            requireLast: false,
          },
          singleline: {
            delimiter: 'semi',
            requireLast: false,
          },
        },
      ],
      '@typescript-eslint/no-confusing-void-expression': 'error',
      // Specific correctness rules from the plan
      'no-duplicate-case': 'error', // duplicate switch cases
      'no-unreachable': 'error', // unreachable code
      'no-constant-binary-expression': 'error', // constant-expression mistakes
      'no-unsafe-finally': 'error', // unsafe finally
      'valid-typeof': 'error', // invalid typeof
      'no-duplicate-enums': 'error', // duplicate enum values
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: angularEslintTemplate,
    },
    plugins: {
      '@angular-eslint': angularEslint,
    },
    extends: [
      // Angular template correctness checks
      'plugin:@angular-eslint/template/recommended',
    ],
    rules: {
      // Angular template specific rules
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/contextualize-blur': 'warn',
      '@angular-eslint/template/interpolation-whitespace': [
        'warn',
        {
          interpolate: {
            preserve: true,
          },
          wrap: '|',
        },
      ],
      '@angular-eslint/template/label-has-associated-control': [
        'error',
        {
          falseNegativeLabels: [
            'legend',
            'placeholder',
            'aria-label',
            'aria-labelledby',
          ],
        },
      ],
      '@angular-eslint/template/lifecycle-hooks': 'error',
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/no-blank': 'error',
      '@angular-eslint/template/no-call-expression': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/no-positive-tabindex': 'warn',
      '@angular-eslint/template/no-safe-navigation': 'error',
      '@angular-eslint/template/no-srcset': 'error',
      '@angular-eslint/template/no-toggle-tabindex': 'warn',
      '@angular-eslint/template/outline-on-focus': 'warn',
      '@angular-eslint/template/prefer-control-flow-let': 'warn',
      '@angular-eslint/template/prefer-output-native': 'warn',
      '@angular-eslint/template/pointer-scroll-events': 'warn',
      '@angular-eslint/template/sort-pipe-accessible-label': 'warn',
      '@angular-eslint/template/tabindex-zero-warning': 'warn',
      '@angular-eslint/template/tabindex-negative-warning': 'warn',
      '@angular-eslint/template/use-track-by-function': 'warn',
      '@angular-eslint/template/valid-aria': 'error',
    },
  },
];