/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EDE7D6',
        'paper-elevated': '#FDFAF0',
        ink: '#1A1A1A',
        'ink-inverse': '#EDE7D6',
        dim: '#6B6B67',
        blueprint: '#1D3D6B',
        'mark-red': '#B5412B',
        'mark-amber': '#9E6F0F',
        'mark-green': '#2D7A4F',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
