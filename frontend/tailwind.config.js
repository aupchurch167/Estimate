/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Coach UI — semantic tokens (preferred for new work).
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-light': 'var(--color-primary-light)',
        'bg-primary': 'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-tertiary': 'var(--color-bg-tertiary)',
        'border-primary': 'var(--color-border-primary)',
        'border-secondary': 'var(--color-border-secondary)',
        'border-focus': 'var(--color-border-focus)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        'text-inverse': 'var(--color-text-inverse)',
        success: 'var(--color-success)',
        'success-light': 'var(--color-success-light)',
        warning: 'var(--color-warning)',
        'warning-light': 'var(--color-warning-light)',
        danger: 'var(--color-danger)',
        'danger-light': 'var(--color-danger-light)',
        info: 'var(--color-info)',
        'info-light': 'var(--color-info-light)',
        neutral: 'var(--color-neutral)',
        'neutral-light': 'var(--color-neutral-light)',

        // Legacy "drafting" aliases — still resolved for unmigrated
        // pages. Aliases the same CSS variables that now point at the
        // Coach palette, so unmigrated pages get the new look for free.
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
        DEFAULT: 'var(--color-border-primary)',
        soft: 'var(--color-border-primary)',
      },
      letterSpacing: {
        title: '0.22em',
        label: '0.14em',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
};
