/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Same instrument-panel palette as the landing page's dark surfaces
      // (landing/tailwind.config.js `deep-*`, `ice`, `gate`, `up-d`, `down-d`),
      // so the demo reads as the lab's big sibling rather than another app.
      colors: {
        surface: {
          primary: '#0c1526',
          secondary: '#14213a',
          tertiary: '#1a2946',
        },
        border: {
          DEFAULT: 'rgba(184, 204, 255, 0.11)',
          hover: 'rgba(184, 204, 255, 0.22)',
        },
        txt: {
          primary: '#e4eaf6',
          secondary: '#aebcd4',
          // Carries timestamps, counts and metadata, so it is body text: it
          // clears 4.5:1 on all three surfaces (lowest, on tertiary, ~5.9:1).
          tertiary: '#98a7c2',
        },
        accent: {
          green: '#5ccb95',
          'green-muted': 'rgba(92, 203, 149, 0.12)',
          red: '#f28a8f',
          'red-muted': 'rgba(242, 138, 143, 0.12)',
          amber: '#e2b25c',
          'amber-muted': 'rgba(226, 178, 92, 0.12)',
          blue: '#9ab5ff',
          'blue-muted': 'rgba(154, 181, 255, 0.12)',
          yellow: '#ecd27a',
          // Primary action fill with dark text, as in the landing's lab.
          ice: '#b8ccff',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Tighter than before (12px) to match the landing's 6-9px panels.
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
          '0%, 100%': { borderLeftColor: 'rgba(92, 203, 149, 0.3)' },
          '50%': { borderLeftColor: 'rgba(92, 203, 149, 0.8)' },
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
