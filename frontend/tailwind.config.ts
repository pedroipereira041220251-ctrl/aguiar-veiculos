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
        background:   '#0a0a0a',
        card:         '#141414',
        'card-hover': '#1a1a1a',
        border:       '#262626',
        primary: {
          DEFAULT: '#dc2626',
          light:   '#ef4444',
          dark:    '#b91c1c',
        },
        sidebar:         '#0f0f0f',
        'sidebar-accent':'#1a1a1a',
        text: {
          primary: '#f5f5f5',
          muted:   '#a3a3a3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
