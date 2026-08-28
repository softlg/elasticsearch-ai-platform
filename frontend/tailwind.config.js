/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          900: "rgb(var(--c-bg-900) / <alpha-value>)",
          800: "rgb(var(--c-bg-800) / <alpha-value>)",
          700: "rgb(var(--c-bg-700) / <alpha-value>)",
        },
        brand: {
          blue: "#2997FF",
          indigo: "#0A84FF",
          cyan: "#64D2FF",
        },
        txt: {
          primary: "rgb(var(--c-txt-primary) / <alpha-value>)",
          muted: "rgb(var(--c-txt-muted) / <alpha-value>)",
        },
        surface: "rgb(var(--c-overlay) / <alpha-value>)",
        ok: "#22C55E",
        danger: "#EF4444",
        warn: "#F59E0B",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
