import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mantle: {
          bg: "#0a0e14",
          card: "#111820",
          border: "#1e2736",
          accent: "#00d4aa",
          "accent-glow": "rgba(0,212,170,0.15)",
          text: "#e8e8ec",
          "text-dim": "#8890a0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
