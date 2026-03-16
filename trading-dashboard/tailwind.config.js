/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          primary: '#0a0a0f',
          secondary: '#12121a',
          tertiary: '#1a1a28',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          hover: 'rgba(255, 255, 255, 0.12)',
        },
        txt: {
          primary: '#e8e8ed',
          secondary: '#8888a0',
          tertiary: '#55556a',
        },
        accent: {
          green: '#00d68f',
          'green-muted': 'rgba(0, 214, 143, 0.12)',
          red: '#ff3d5a',
          'red-muted': 'rgba(255, 61, 90, 0.12)',
          amber: '#ffab00',
          'amber-muted': 'rgba(255, 171, 0, 0.12)',
          blue: '#448aff',
          'blue-muted': 'rgba(68, 138, 255, 0.12)',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
      maxWidth: {
        content: '1500px',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

