import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', 'Cambria', '"Times New Roman"', 'serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      // Identity type scale (see globals.css --text-*). Keys are chosen to NOT
      // collide with Tailwind defaults (no sm/xs override), so adding them is
      // inert until a class opts in. Display sizes are set in Instrument Serif
      // italic at call sites; these only carry the px value.
      fontSize: {
        hero: 'var(--text-hero)',
        display: 'var(--text-display)',
        'title-lg': 'var(--text-title-lg)',
        title: 'var(--text-title)',
        '2xs': 'var(--text-2xs)',
        overline: 'var(--text-overline)',
        label: 'var(--text-label)',
        'mono-md': 'var(--text-mono-md)',
        'mono-sm': 'var(--text-mono-sm)',
      },
      // Non-colliding names only (Tailwind default `tight` is -0.025em; ours is
      // -0.005em, so it is exposed as `amount`).
      letterSpacing: {
        figure: 'var(--tracking-figure)',
        title: 'var(--tracking-title)',
        amount: 'var(--tracking-tight)',
        overline: 'var(--tracking-overline)',
        label: 'var(--tracking-label)',
        loose: 'var(--tracking-loose)',
      },
      // Tailwind defaults `tight`/`snug` differ in value, so ours are exposed
      // under non-colliding names.
      lineHeight: {
        figure: 'var(--leading-tight)',
        quote: 'var(--leading-snug)',
      },
      // `modal` rather than `xl` to avoid overriding Tailwind's default shadow-xl.
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        modal: 'var(--shadow-xl)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        ink: {
          0: 'var(--ink-0)',
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        line: {
          1: 'var(--line-1)',
          2: 'var(--line-2)',
          3: 'var(--line-3)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          soft: 'var(--paper-soft)',
          mute: 'var(--paper-mute)',
          dim: 'var(--paper-dim)',
        },
        brass: {
          DEFAULT: 'var(--brass)',
          hi: 'var(--brass-hi)',
          lo: 'var(--brass-lo)',
          soft: 'var(--brass-soft)',
          ghost: 'var(--brass-ghost)',
        },
        sage: { DEFAULT: 'hsl(var(--sage))', soft: 'hsl(var(--sage-soft))' },
        coral: { DEFAULT: 'hsl(var(--coral))', soft: 'hsl(var(--coral-soft))' },
        flag: { DEFAULT: 'hsl(var(--flag))', soft: 'hsl(var(--flag-soft))' },
        // Category swatch palette (mirrors lib/categoryOptions.ts CATEGORY_COLORS).
        cat: {
          1: 'var(--cat-1)',
          2: 'var(--cat-2)',
          3: 'var(--cat-3)',
          4: 'var(--cat-4)',
          5: 'var(--cat-5)',
          6: 'var(--cat-6)',
          7: 'var(--cat-7)',
          8: 'var(--cat-8)',
          9: 'var(--cat-9)',
          10: 'var(--cat-10)',
          11: 'var(--cat-11)',
          12: 'var(--cat-12)',
          13: 'var(--cat-13)',
          14: 'var(--cat-14)',
          15: 'var(--cat-15)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
