// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default [
  {
    ignores: [
      '.eslintrc.cjs',
      'jest.config.js',
      'build.js',
      'babel.config.js',
      'tests/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'tests-reports/**',
      'src/config/**',
      'next-env.d.ts',
      'postcss.config.js',
      'vite.config.ts',
      'tailwind.config.js',
      'tailwind.config.ts',
      '.next/**',
      'out/**',
      'eslint.config.mjs',
      'proxy.ts'
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],

    plugins: {
      '@typescript-eslint': typescriptEslint,
      'unused-imports': unusedImports,
      react: react
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.json'
      }
    },

    settings: {
      react: {
        version: 'detect'
      }
    },

    rules: {
      'block-spacing': ['warn', 'always'],
      'brace-style': ['warn', '1tbs'],
      curly: ['warn', 'all'],
      indent: 'off',
      'no-mixed-spaces-and-tabs': 'error',
      'no-multi-spaces': 'warn',
      'no-trailing-spaces': 'warn',
      'no-whitespace-before-property': 'error',
      'react/jsx-boolean-value': 'off',
      'react/jsx-indent-props': ['off'],
      'space-before-blocks': ['warn', 'always'],

      'space-before-function-paren': [
        'warn',
        {
          named: 'never',
          anonymous: 'ignore',
          asyncArrow: 'always'
        }
      ],

      'space-in-parens': ['warn', 'never'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-misused-promises': 'off',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],

      'unused-imports/no-unused-imports': 'error',

      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ],

      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'no-async-promise-executor': 'warn',
      'react/prop-types': 'off',
      'react/no-unknown-property': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      'react/react-in-jsx-scope': 'off',
      'max-len': 'off'
    }
  }
];
