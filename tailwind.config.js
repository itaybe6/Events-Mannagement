/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  // Required for NativeWind on web when color scheme is controlled via class.
  // Fixes: "Cannot manually set color scheme, as dark mode is type 'media' ..."
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        // On native, Expo loads Rubik under keys like "Rubik_400Regular".
        // On web, the CSS font-family is "Rubik" (Google Fonts via `global.css`).
        // Put the native name first so `font-sans` works cross-platform.
        sans: ["Rubik_400Regular", "Rubik", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};

