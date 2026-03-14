// ESLint 9 uses flat config (eslint.config.js). Legacy .eslintrc.json is kept for reference.
// This config provides: React, React Hooks, TypeScript, JSX validation, Prettier.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'admin/*', 'functions/*'],
  },
]);
