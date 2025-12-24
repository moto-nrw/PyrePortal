/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#24c8db',
        secondary: '#396cd8',
        // Modal system colors
        modal: {
          success: '#83cd2d',
          warning: '#f87C10',
          error: '#ef4444',
          info: '#6366f1',
          schulhof: '#F59E0B',
          supervisor: '#3B82F6',
        },
      },
      boxShadow: {
        button: '0 2px 2px rgba(0, 0, 0, 0.4)',
        card: '0 4px 8px rgba(0, 0, 0, 0.2)',
        modal: '0 20px 50px rgba(0, 0, 0, 0.3)',
        'modal-elevated': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
      keyframes: {
        // SuccessModal pop animation
        modalPop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // InfoModal backdrop fade
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        // InfoModal card slide in
        modalSlideIn: {
          from: { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'modal-pop': 'modalPop 300ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'modal-slide-in': 'modalSlideIn 300ms ease-out',
      },
      borderRadius: {
        modal: '32px',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};
