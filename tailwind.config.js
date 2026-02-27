/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        paper: {
          50: '#FAF7F2',
          100: '#F3EDE3',
          200: '#E8DDD0',
          300: '#D4C4B0',
        },
        ink: {
          900: '#1C1917',
          800: '#292524',
          700: '#44403C',
          600: '#57534E',
          500: '#78716C',
          400: '#A8A29E',
          300: '#D6D3D1',
        },
        amber: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#C2840A',
          800: '#92400E',
        },
        teal: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
        }
      },
      boxShadow: {
        'book': '2px 4px 12px rgba(28,25,23,0.12), 0 1px 3px rgba(28,25,23,0.08)',
        'book-hover': '4px 8px 24px rgba(28,25,23,0.18), 0 2px 6px rgba(28,25,23,0.10)',
        'card': '0 1px 3px rgba(28,25,23,0.08), 0 1px 2px rgba(28,25,23,0.06)',
      }
    },
  },
  plugins: [],
}
