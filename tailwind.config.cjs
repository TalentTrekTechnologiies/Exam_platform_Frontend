// tailwind.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },

        /**
         * Exam chrome. A deep, slightly blue-black reads as institutional rather
         * than fashionable — the gravitas an examination screen needs.
         */
        chrome: {
          DEFAULT: "#0f172a",
          soft: "#1e293b",
          line: "#334155",
        },

        /**
         * Question-status palette. These five states are the vocabulary every
         * EAMCET / NEET / NQT candidate already knows, so the hues stay
         * conventional (green = answered, red = seen but blank, purple = marked).
         * Deepened for contrast against white; used for status and nothing else.
         */
        status: {
          answered: "#15803d",
          answeredSoft: "#dcfce7",
          unanswered: "#b91c1c",
          unansweredSoft: "#fee2e2",
          marked: "#6d28d9",
          markedSoft: "#ede9fe",
          unseen: "#64748b",
          unseenSoft: "#f1f5f9",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        // Question text sits at 17px/1.75 — long physics stems need the leading.
        question: ["1.0625rem", { lineHeight: "1.75", letterSpacing: "-0.005em" }],
        option: ["1rem", { lineHeight: "1.6" }],
        micro: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.08em" }],
      },
      borderRadius: {
        // Restrained. Precision reads as serious; 32px radii read as a web app.
        exam: "0.5rem",
      },
      maxWidth: {
        // ~68 characters: the comfortable reading measure for dense stems.
        stem: "68ch",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-in": "slideIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
