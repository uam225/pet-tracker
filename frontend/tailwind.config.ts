/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — "warm precision": earthy but clear
        forest: {
          50:  '#EEF4F0',
          100: '#D6E8DC',
          200: '#AECFBB',
          300: '#7DAF90',
          400: '#4E8F6A',
          500: '#2C5F4A',  // primary brand
          600: '#204D3A',
          700: '#173B2C',
          800: '#0F291E',
          900: '#081812',
        },
        sage: {
          100: '#DDE8E2',
          200: '#B8D0C5',
          300: '#8FB3A5',
          400: '#6B9587',
          500: '#4D7869',
          DEFAULT: '#6B9587',
        },
        // Warm amber — personal, living, used for accents and pet colour 3
        copper: {
          100: '#FAEADE',
          200: '#F0C9A2',
          300: '#E3A86A',
          400: '#C98445',
          500: '#A8622A',
          DEFAULT: '#C98445',
        },
        // Surface / structural
        stone: {
          50:  '#FAF9F6',
          100: '#F2F0EC',  // page background
          200: '#E5E1DA',
          300: '#CCC7BE',
          400: '#A09890',
          500: '#7A7268',
        },
        // Per-pet identity colours (assigned by index)
        pet: {
          blue:   '#4A7FB5',  // Dog slot 0
          violet: '#8B6BAF',  // Dog slot 1
          amber:  '#C98445',  // Cat slot 0 (matches copper.DEFAULT)
          teal:   '#3D8B7F',  // Overflow / future pets
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        float: '0 4px 16px -2px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
        nav:   '0 -1px 0 0 rgb(0 0 0 / 0.06)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'nav': '4rem', // bottom nav height (64px)
      },
      animation: {
        'fade-in':   'fadeIn 0.15s ease-out',
        'slide-up':  'slideUp 0.2s ease-out',
        'pulse-dot': 'pulseDot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '.5' } },
      },
    },
  },
  plugins: [],
}
