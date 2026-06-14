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
      // Design-system guardrail: amounts go through lib/euro (formatEuro /
      // formatAmount / formatCompact) or the <Money> component — never a
      // hand-rolled Intl.NumberFormat. Keeps every figure formatted identically.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
          message:
            'Format amounts via lib/euro (formatEuro/formatAmount/formatCompact) or <Money> — do not hand-roll Intl.NumberFormat (design-system drift).',
        },
      ],
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

  // shadcn `chart` is generated, Recharts-typed vendored code (loose `any` at the
  // Recharts boundary). Relax the type-aware strictness for this one file only.
  {
    files: ['src/renderer/components/ui/chart.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // --- Prettier last: disable rules that conflict with formatting ---
  prettier,

  { ignores: ['dist/', 'out/', 'node_modules/', '.vite/', 'scripts/'] },
);
