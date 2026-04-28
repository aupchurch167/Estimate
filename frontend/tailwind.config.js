/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        'paper-elevated': 'var(--color-paper-elevated)',
        ink: 'var(--color-ink)',
        'ink-inverse': 'var(--color-ink-inverse)',
        dim: 'var(--color-dim)',
        blueprint: 'var(--color-blueprint)',
        'mark-red': 'var(--color-mark-red)',
        'mark-amber': 'var(--color-mark-amber)',
        'mark-green': 'var(--color-mark-green)',
        rule: 'var(--color-rule)',
        'rule-soft': 'var(--color-rule-soft)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderColor: {
        DEFAULT: 'var(--color-rule)',
        soft: 'var(--color-rule-soft)',
      },
      letterSpacing: {
        title: '0.22em',
        label: '0.14em',
      },
    },
  },
  plugins: [],
};
