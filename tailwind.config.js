/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#FFB6C1", // Light Pink for main accents
        secondary: "#FF69B4", // Hot Pink for highlights
        "background-light": "#FFF0F5", // Lavender Blush for light background
        "background-dark": "#362F4A", // Dark Plum for dark background
        "text-light": "#362F4A", // Dark text on light background
        "text-dark": "#FFF0F5", // Light text on dark background
        "retro-gray": "#c0c0c0",
        "retro-border": "#808080",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        mono: ["'VT323'", "monospace"],
        cute: ["'Cherry Bomb One'", "cursive"], // Add cute font
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
    },
  },
  plugins: [],
}


