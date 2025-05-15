/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#24c8db',
        secondary: '#396cd8',
      },
      boxShadow: {
        button: '0 2px 2px rgba(0, 0, 0, 0.4)',
        card: '0 4px 8px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};
