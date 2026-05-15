/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--bg-rgb) / <alpha-value>)',
          soft: 'rgb(var(--bg-soft-rgb) / <alpha-value>)',
          card: 'rgb(var(--bg-card-rgb) / <alpha-value>)',
          elev: 'rgb(var(--bg-elev-rgb) / <alpha-value>)',
          line: 'rgb(var(--bg-line-rgb) / <alpha-value>)',
        },
        overlay: 'rgb(var(--overlay-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        accent: {
          DEFAULT: '#ff4d1f',
          hover: '#ff6a40',
          soft: '#ff8a65',
          glow: '#ffae8a',
          deep: '#c93a14',
        },
        success: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 30px rgba(0,0,0,0.45)',
        glow: '0 8px 40px rgba(255, 77, 31, 0.35)',
        ring: '0 0 0 1px rgba(255,255,255,0.06)',
      },
      borderRadius: {
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
      },
      backgroundImage: {
        'orange-card':
          'linear-gradient(135deg, #ff4d1f 0%, #ff7a3c 55%, #ff9e6b 100%)',
        'orange-soft':
          'linear-gradient(135deg, rgba(255,77,31,0.18), rgba(255,138,101,0.06))',
      },
    },
  },
  plugins: [],
};
