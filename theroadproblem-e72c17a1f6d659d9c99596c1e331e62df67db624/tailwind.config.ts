import type { Config } from "tailwindcss";

const themeColor = (name: string) => `rgb(var(--clay-${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        canvas: themeColor("canvas"),
        surface: themeColor("surface"),
        soft: themeColor("soft"),
        ink: themeColor("ink"),
        muted: themeColor("muted"),
        quiet: themeColor("quiet"),
        line: themeColor("line"),
        "line-strong": themeColor("line-strong"),
        information: themeColor("information"),
        positive: themeColor("positive"),
        warning: themeColor("warning"),
        source: themeColor("source"),
        danger: themeColor("danger"),
        cyan: { 50: themeColor("info-soft"), 100: themeColor("info-soft"), 200: "#a9eaff", 300: "#00627d", 400: themeColor("information"), 500: "#0089ad", 600: "#00627d", 700: "#005b73", 800: "#00536a", 900: themeColor("info-soft"), 950: themeColor("info-soft") },
        emerald: { 50: themeColor("positive-soft"), 100: themeColor("positive-soft"), 200: "#b4efc7", 300: "#07804b", 400: themeColor("positive"), 500: "#078a52", 600: "#076d42", 700: "#02492a", 800: "#02492a", 900: themeColor("positive-soft"), 950: themeColor("positive-soft") },
        amber: { 50: themeColor("warning-soft"), 100: themeColor("warning-soft"), 200: "#f8cc65", 300: "#8a5b08", 400: themeColor("warning"), 500: "#fbbd41", 600: "#8a5b08", 700: "#805407", 800: "#744a06", 900: themeColor("warning-soft"), 950: themeColor("warning-soft") },
        purple: { 100: themeColor("source-soft"), 200: "#d9ceff", 300: "#604293", 400: themeColor("source"), 500: "#7653ba", 600: "#604293", 700: "#43089f", 800: "#43089f", 900: themeColor("source-soft"), 950: themeColor("source-soft") },
        rose: { 100: themeColor("danger-soft"), 200: "#ffc3c8", 300: "#a12d3b", 400: themeColor("danger"), 500: "#be4050", 600: "#a12d3b", 700: "#892332", 800: "#892332", 900: themeColor("danger-soft"), 950: themeColor("danger-soft") },
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
      },
      screens: {
        xs: "360px",
      },
    },
  },
  plugins: [],
} satisfies Config;
