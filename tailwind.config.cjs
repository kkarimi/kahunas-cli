module.exports = {
  content: ["./src/web/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        bg1: "#fbf6f0",
        bg2: "#eef4ff",
        card: "#fffdf9",
        ink: "#1e1a2b",
        muted: "#5f6b7a",
        line: "#e1e6f0",
        accent: "#e85d3f",
        "accent-strong": "#c7462d",
        "accent-soft": "#ffe1d6",
        chip: "#e9f1ff",
        "chip-ink": "#1d3760",
      },
      boxShadow: {
        card: "0 18px 40px rgba(30, 26, 43, 0.12)",
      },
      fontFamily: {
        sans: ["Spline Sans", "system-ui", "sans-serif"],
        display: ["Fraunces", "serif"],
      },
      keyframes: {
        fadeSlide: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-slide": "fadeSlide 0.5s ease both",
      },
    },
  },
  plugins: [],
};
