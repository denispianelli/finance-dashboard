import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        // Map `font-sans` to Geist so labelled elements match the Geist body
        // font instead of falling back to the system stack (mirrors --font-sans).
        sans: [
          '"Geist Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        // Serif is retired in Aurora; alias to Geist so any residual `font-serif`
        // call site renders the sans face (figures are bold Geist now).
        serif: [
          '"Geist Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: ['"Geist Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      // Identity type scale (see globals.css --text-*). Keys are chosen to NOT
      // collide with Tailwind defaults (no sm/xs override), so adding them is
      // inert until a class opts in. Display sizes apply to bold Geist Sans at
      // the call sites; these keys carry only the px value.
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
        glass: 'var(--shadow)',
        'glass-lg': 'var(--shadow-lg)',
        pop: 'var(--shadow-pop)',
        'glow-accent': 'var(--glow-accent)',
      },
      backdropBlur: {
        glass: '18px',
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
        // RGB-channel form so the `/NN` opacity modifier works (the kit uses
        // line-2 at 0.7 for table-row hairlines). Plain `border-line-x` stays
        // full-opacity; the hex `--line-x` vars remain for raw SVG strokes.
        line: {
          1: 'rgb(var(--line-1-rgb) / <alpha-value>)',
          2: 'rgb(var(--line-2-rgb) / <alpha-value>)',
          3: 'rgb(var(--line-3-rgb) / <alpha-value>)',
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
        // ---- Aurora-native handles (additive) ----
        'accent-brand': 'var(--accent-brand)',
        'accent-2': 'var(--accent-2)',
        'accent-ink': 'var(--accent-ink)',
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          solid: 'var(--surface-solid)',
        },
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
          4: 'var(--text-4)',
        },
        income: 'var(--income)',
        expense: 'var(--expense)',
        flagc: 'var(--flag-color)',
      },
    },
  },
  plugins: [],
};

export default config;
