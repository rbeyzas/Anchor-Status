import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-body)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--color-surface-muted) / <alpha-value>)',
        'surface-glass': 'rgb(var(--color-surface-glass) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--color-border-strong) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--color-ink-faint) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        sticker: {
          sky: '#62aef0',
          purple: '#d6b6f6',
          pink: '#ff64c8',
          orange: '#dd5b00',
          teal: '#2a9d99',
          green: '#1aae39',
        },
        'accent-soft': 'rgb(var(--color-accent-soft) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-soft': 'rgb(var(--color-success-soft) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--color-warning-soft) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--color-danger-soft) / <alpha-value>)',
        neutral: 'rgb(var(--color-neutral) / <alpha-value>)',
        'neutral-soft': 'rgb(var(--color-neutral-soft) / <alpha-value>)',

        // Mission-control console tokens (design-system v2): additive,
        // the "as-" names above are untouched.
        'as-surface-0': 'rgb(var(--as-surface-0) / <alpha-value>)',
        'as-surface-1': 'rgb(var(--as-surface-1) / <alpha-value>)',
        'as-surface-2': 'rgb(var(--as-surface-2) / <alpha-value>)',
        'as-hairline': 'rgb(var(--as-hairline) / <alpha-value>)',
        'as-hairline-strong': 'rgb(var(--as-hairline-strong) / <alpha-value>)',
        'as-border-control': 'rgb(var(--as-border-control) / <alpha-value>)',
        'as-ink': 'rgb(var(--as-ink) / <alpha-value>)',
        'as-ink-muted': 'rgb(var(--as-ink-muted) / <alpha-value>)',
        'as-ink-faint': 'rgb(var(--as-ink-faint) / <alpha-value>)',
        'as-signal': 'rgb(var(--as-signal) / <alpha-value>)',
        'as-on-signal': 'rgb(var(--as-on-signal) / <alpha-value>)',
        'as-signal-soft': 'rgb(var(--as-signal-soft) / <alpha-value>)',
        'as-pulse': 'rgb(var(--as-pulse) / <alpha-value>)',
        'as-on-pulse': 'rgb(var(--as-on-pulse) / <alpha-value>)',
        'as-pulse-soft': 'rgb(var(--as-pulse-soft) / <alpha-value>)',
        'as-amber': 'rgb(var(--as-amber) / <alpha-value>)',
        'as-on-amber': 'rgb(var(--as-on-amber) / <alpha-value>)',
        'as-amber-soft': 'rgb(var(--as-amber-soft) / <alpha-value>)',
        'as-danger': 'rgb(var(--as-danger) / <alpha-value>)',
        'as-on-danger': 'rgb(var(--as-on-danger) / <alpha-value>)',
        'as-danger-soft': 'rgb(var(--as-danger-soft) / <alpha-value>)',
        'as-score-high': 'rgb(var(--as-score-high) / <alpha-value>)',
        'as-score-medium': 'rgb(var(--as-score-medium) / <alpha-value>)',
        'as-score-low': 'rgb(var(--as-score-low) / <alpha-value>)',
      },
      borderRadius: {
        card: '12px',
        pill: '999px',
        'as-xs': '2px',
        'as-sm': '6px',
        'as-md': '10px',
        'as-lg': '16px',
      },
      boxShadow: {
        // Notion-style layered micro-shadows: many near-transparent stops.
        glow: '0 0 0 1px rgb(0 0 0 / 0.05), 0 4px 18px rgb(0 0 0 / 0.04), 0 23px 52px rgb(0 0 0 / 0.08)',
        'glow-success': '0 2px 8px rgb(0 0 0 / 0.03), 0 4px 18px rgb(0 0 0 / 0.05)',
        'glow-accent': '0 2px 8px rgb(0 0 0 / 0.03), 0 4px 18px rgb(0 0 0 / 0.05)',
        'glow-danger': '0 0 0 1px rgb(var(--color-danger) / 0.2)',
        card: '0 0.175px 1px rgb(0 0 0 / 0.01), 0 0.8px 2.9px rgb(0 0 0 / 0.02), 0 2px 7.8px rgb(0 0 0 / 0.027), 0 4px 18px rgb(0 0 0 / 0.04)',
        // Mission-control console shadows (design-system v2).
        'as-panel': 'var(--as-shadow-panel)',
        'as-panel-hover': 'var(--as-shadow-panel-hover)',
        'as-glow-signal': 'var(--as-shadow-glow-signal)',
        'as-glow-danger': 'var(--as-shadow-glow-danger)',
        'as-focus-ring': 'var(--as-shadow-focus-ring)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, rgb(var(--color-surface)) 0%, transparent 12%, transparent 88%, rgb(var(--color-surface)) 100%)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(0.85)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
      transitionDuration: {
        // Mission-control console motion (design-system v2), additive.
        'as-fast': '150ms',
        'as-base': '260ms',
        'as-reveal': '700ms',
        'as-sweep': '4000ms',
        'as-ambient': '24000ms',
      },
      transitionTimingFunction: {
        'as-out': 'cubic-bezier(0.2, 0, 0, 1)',
        'as-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
