/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#05070b",
        panel: "#0a0e16",
        "panel-2": "#0d1220",
        edge: "#1a2233",
        headline: "#f2f4f8",
        body: "#c3c9d6",
        muted: "#8b93a7",
        faint: "#5c657b",
        accent: "#448aff",
        up: "#00d68f",
        down: "#ff3d5a",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        wrap: "72rem",
      },
    },
  },
  plugins: [],
};
