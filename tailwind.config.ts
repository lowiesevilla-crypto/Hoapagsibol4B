import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10354c",
        pine: { 50: "#eef9ff", 100: "#d9f1ff", 500: "#078bc9", 600: "#0678b2", 700: "#08618d", 900: "#0a3b57" },
        leaf: { 50: "#f1fdea", 100: "#dff8d2", 500: "#72d84e", 600: "#58c63b", 700: "#3fa42c" },
        sand: "#f5fbff",
        gold: "#72d84e"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(8, 97, 141, 0.09)",
        brand: "0 10px 25px rgba(7, 139, 201, 0.24)"
      }
    },
  },
  plugins: [],
} satisfies Config;
