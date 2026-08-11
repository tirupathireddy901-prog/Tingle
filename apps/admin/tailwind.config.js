/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tingle design system tokens (spec section 6)
        midnight: "#0B0C10",
        graphite: "#1A1C22",
        charcoal: "#232630",
        violet: "#7C5CFC",
        indigo: "#5B4BDB",
        cyan: "#3CD3F0",
        "status-connected": "#22C55E",
        "status-connecting": "#F59E0B",
        "status-error": "#EF4444",
      },
      fontFamily: {
        sans: ["Inter", "Manrope", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
