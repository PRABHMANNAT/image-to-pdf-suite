/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(59,130,246,0.45), 0 8px 24px -8px rgba(59,130,246,0.55)',
        'glow-lg': '0 0 0 1px rgba(59,130,246,0.6), 0 18px 60px -18px rgba(59,130,246,0.7)',
        soft: '0 10px 30px -12px rgba(15,23,42,0.18)',
        'soft-dark': '0 10px 30px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'mesh-light':
          'radial-gradient(at 12% 8%, rgba(59,130,246,0.18) 0px, transparent 50%),' +
          'radial-gradient(at 90% 0%, rgba(168,85,247,0.18) 0px, transparent 50%),' +
          'radial-gradient(at 80% 90%, rgba(14,165,233,0.16) 0px, transparent 50%),' +
          'radial-gradient(at 10% 95%, rgba(236,72,153,0.14) 0px, transparent 50%)',
        'mesh-dark':
          'radial-gradient(at 12% 8%, rgba(59,130,246,0.22) 0px, transparent 50%),' +
          'radial-gradient(at 90% 0%, rgba(168,85,247,0.22) 0px, transparent 50%),' +
          'radial-gradient(at 80% 90%, rgba(14,165,233,0.20) 0px, transparent 50%),' +
          'radial-gradient(at 10% 95%, rgba(236,72,153,0.18) 0px, transparent 50%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'slide-up': 'slide-up 0.35s ease-out both',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
