import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2a78d6",
          dark: "#1e5aa8",
        },
      },
    },
  },
  plugins: [],
};
export default config;
