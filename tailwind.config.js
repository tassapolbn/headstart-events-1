/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef3f8',
          100: '#d5e0ec',
          200: '#acc2d9',
          300: '#7d9fc0',
          400: '#4f7ba6',
          500: '#2f5d8a',
          600: '#234b72',
          700: '#1a3c5e',
          800: '#142e49',
          900: '#0e2135'
        },
        gold: {
          50: '#fdf7e7',
          100: '#faecc2',
          200: '#f6dd8e',
          300: '#f2cc59',
          400: '#f0b323',
          500: '#d99c12',
          600: '#b57c0d',
          700: '#8f5e0c',
          800: '#6a450e',
          900: '#4c320d'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 3px rgba(14,33,53,0.08), 0 4px 16px rgba(14,33,53,0.06)'
      }
    },
  },
  plugins: [],
};
