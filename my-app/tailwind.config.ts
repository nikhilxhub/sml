import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F7F5",
        foreground: "#1A1A1A",
        surface: "#FAFAFA",
        border: "#E5E5E5",
        primary: "#1A1A1A",
        muted: "#737373",
        "tax-high": "#C05656", // Muted brick red
        "tax-low": "#6B8E6B", // Soft sage green
      },
      fontFamily: {
        serif: ["var(--font-instrument-serif)", "serif"],
        body: ["Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
