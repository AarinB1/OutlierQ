/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
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
          // Was #55556a, which measured 2.37:1 on surface-tertiary and 2.72:1 on
          // surface-primary — well under the WCAG AA 4.5:1 floor for body text,
          // and this token carries timestamps, counts and metadata. Lightened
          // in-hue to clear 4.5:1 on all three surfaces (min 4.76:1).
          tertiary: '#8484a4',
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
          yellow: '#ffd60a',
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
        content: '1400px',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease',
        'pulse-border': 'pulseBorder 2s ease-in-out 1',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseBorder: {
          '0%, 100%': { borderLeftColor: 'rgba(0, 214, 143, 0.3)' },
          '50%': { borderLeftColor: 'rgba(0, 214, 143, 0.8)' },
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
