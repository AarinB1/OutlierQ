/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paper: the page ground, a tinted band, and chip/icon wells.
        paper: "#f6f7f4",
        "paper-2": "#eceff1",
        "paper-3": "#e1e6ec",
        // Ink on paper. Every text token clears 4.5:1 on paper-2, the darkest
        // light surface it sits on (measured on the composited page).
        ink: "#131c2e",
        body: "#3a4456",
        muted: "#515b6d",
        faint: "#5a6476",
        line: "#d6dbe2",
        "line-2": "#c5ccd6",
        // Brand accent. Deliberately not green: green and red carry call/put
        // and up/down meaning everywhere on this site.
        accent: "#2347a6",
        "accent-deep": "#1a3782",
        "accent-soft": "#e1e8f7",
        up: "#1c7547",
        down: "#b3261e",
        // Instrument panels: the dark islands (hero figure, lab, terminal).
        // The dashboard demo uses the same values.
        deep: "#0f1a2e",
        "deep-2": "#14213a",
        "deep-3": "#1a2946",
        "deep-line": "#2b3c5e",
        "deep-ink": "#e4eaf6",
        "deep-muted": "#aebcd4",
        "deep-faint": "#98a7c2",
        ice: "#b8ccff",
        gate: "#e2b25c",
        "up-d": "#5ccb95",
        "down-d": "#f28a8f",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        wrap: "80rem",
      },
    },
  },
  plugins: [],
};
