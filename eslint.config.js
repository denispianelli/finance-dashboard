import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // --- Base: all TS/TSX (main, preload, renderer, tests) ---
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json' },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // --- Renderer only: React Hooks + Fast Refresh correctness ---
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
    },
  },

  // shadcn/ui primitives colocate component + cva variants by convention.
  // only-export-components is a DX-only Fast Refresh rule (no prod impact);
  // react-hooks rules still fully apply here.
  {
    files: ['src/renderer/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // --- Prettier last: disable rules that conflict with formatting ---
  prettier,

  { ignores: ['dist/', 'out/', 'node_modules/', '.vite/'] },
);
