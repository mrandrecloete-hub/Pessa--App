/* eslint-disable @typescript-eslint/no-require-imports */
const tseslint = require('typescript-eslint');
module.exports = tseslint.config(
  { ignores: ['**/node_modules/**', '**/.expo/**', 'apps/android/assets/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-restricted-syntax': ['error', { selector: "CallExpression[callee.name='parseFloat']", message: 'Never use floating point for money. Use @moneva/shared.' }] } },
);
