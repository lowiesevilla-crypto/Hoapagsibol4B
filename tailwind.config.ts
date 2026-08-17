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
        gold: "#72d84e",
        surface: {
          canvas: "#f5fbff",
          card: "#ffffff",
          subtle: "#f7fbfd",
          elevated: "#ffffff",
        },
        status: {
          success: "#16875f",
          info: "#0874ad",
          warning: "#986311",
          critical: "#aa3e4b",
          ai: "#6553c9",
        },
        platform: {
          50: "#eef6fa",
          500: "#0b789f",
          700: "#0b4e6d",
          900: "#061d2d",
        },
      },
      boxShadow: {
        soft: "0 16px 45px rgba(8, 97, 141, 0.09)",
        brand: "0 10px 25px rgba(7, 139, 201, 0.24)",
        workspace: "0 12px 34px rgba(15, 65, 90, 0.07)",
        floating: "0 18px 50px rgba(15, 44, 61, 0.14)",
      },
      borderRadius: {
        workspace: "1.25rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
