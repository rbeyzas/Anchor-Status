import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
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
        'accent-soft': 'rgb(var(--color-accent-soft) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-soft': 'rgb(var(--color-success-soft) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--color-warning-soft) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--color-danger-soft) / <alpha-value>)',
        neutral: 'rgb(var(--color-neutral) / <alpha-value>)',
        'neutral-soft': 'rgb(var(--color-neutral-soft) / <alpha-value>)',
      },
      borderRadius: {
        card: '18px',
        pill: '999px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--color-border) / 0.6), 0 8px 30px -10px rgb(var(--color-accent) / 0.25)',
        'glow-success': '0 0 24px -4px rgb(var(--color-success) / 0.45)',
        'glow-accent': '0 0 24px -4px rgb(var(--color-accent) / 0.45)',
        'glow-danger': '0 0 24px -4px rgb(var(--color-danger) / 0.45)',
        card: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 12px 40px -18px rgb(0 0 0 / 0.55)',
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
    },
  },
  plugins: [],
};

export default config;
