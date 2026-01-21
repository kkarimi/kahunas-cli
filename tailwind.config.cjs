module.exports = {
  content: ["./src/web/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        bg1: "#f6f7fb",
        bg2: "#eef3f9",
        card: "#ffffff",
        ink: "#1f2430",
        muted: "#6b7280",
        line: "#e3e8f2",
        accent: "#2f7f6f",
        "accent-soft": "#e7f5f1",
        chip: "#eaf5ff",
      },
      boxShadow: {
        card: "0 12px 30px rgba(31, 36, 48, 0.08)",
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
