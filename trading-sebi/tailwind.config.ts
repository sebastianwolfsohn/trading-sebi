import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#121722",
        line: "#222a38",
        muted: "#8b95a7",
        win: "#22c55e",
        loss: "#ef4444",
        accent: "#6366f1",
      },
    },
  },
  plugins: [],
} satisfies Config;
