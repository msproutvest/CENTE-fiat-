/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Red Hat Display"', 'sans-serif'],
      },
      colors: {
        gold: {
          primary: '#b8860b',
          secondary: '#d4af37',
          dark: '#8B6914',
          light: '#fffacd',
          accent: '#daa520',
        },
      },
    },
  },
  plugins: [],
};
