import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background:   '#080808',
        card:         '#111111',
        'card-hover': '#181818',
        border:       '#1f1f1f',
        'border-bright': '#2a2a2a',
        primary: {
          DEFAULT: '#e63030',
          light:   '#ff4444',
          dark:    '#c42020',
          glow:    'rgba(230, 48, 48, 0.15)',
        },
        accent: {
          DEFAULT: '#22c55e',
          dim:     'rgba(34, 197, 94, 0.12)',
        },
        sidebar:         '#0c0c0c',
        'sidebar-accent':'#161616',
        text: {
          primary: '#ededed',
          muted:   '#717171',
          dim:     '#404040',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', '1rem'],
      },
      boxShadow: {
        'glow-red':   '0 0 20px rgba(230, 48, 48, 0.15), 0 0 40px rgba(230, 48, 48, 0.05)',
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.1)',
        'card':       '0 1px 3px rgba(0,0,0,0.4)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in':   'fade-in 0.25s ease-out',
        'slide-in':  'slide-in 0.2s ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
