/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#131921", 2: "#1C2535", 3: "#0D1117" },
        orange: { DEFAULT: "#E47911", 2: "#F0A050", 3: "#FFD814" },
        teal: { DEFAULT: "#006B6B", 2: "#00A8A8" },
        rs: {
          green: "#22C55E",
          red: "#EF4444",
          yellow: "#FFD814",
          muted: "#8892A0",
          border: "#232F3E",
          gold: "#C9973A",
          dark: "#0A0F1E",
        },
      },
      fontFamily: {
        hero: ["Bricolage Grotesque", "Syne", "Inter", "sans-serif"],
        display: ["Syne", "Inter", "sans-serif"],
        body: ["DM Sans", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 8px 28px rgba(13, 17, 23, 0.08)",
      },
    },
  },
  plugins: [],
};
