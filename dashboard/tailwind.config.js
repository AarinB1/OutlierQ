/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Strict monochrome scheme. Semantic accent names are kept so
        // components don't churn: green=white (up/primary), red=mid gray
        // (down/danger), amber/yellow=light gray (warn), blue=off-white
        // (interactive). Direction is carried by glyphs (▲▼ ±), not hue.
        surface: {
          primary: '#070707',
          secondary: '#0e0e0e',
          tertiary: '#181818',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.18)',
        },
        txt: {
          primary: '#f5f5f5',
          secondary: '#9c9c9c',
          tertiary: '#5f5f5f',
        },
        accent: {
          green: '#ffffff',
          'green-muted': 'rgba(255, 255, 255, 0.10)',
          red: '#8a8a8a',
          'red-muted': 'rgba(255, 255, 255, 0.05)',
          amber: '#c4c4c4',
          'amber-muted': 'rgba(255, 255, 255, 0.08)',
          blue: '#e0e0e0',
          'blue-muted': 'rgba(255, 255, 255, 0.08)',
          yellow: '#c4c4c4',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
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
          '0%, 100%': { borderLeftColor: 'rgba(255, 255, 255, 0.3)' },
          '50%': { borderLeftColor: 'rgba(255, 255, 255, 0.8)' },
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
