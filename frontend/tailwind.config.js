/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.02)',
          hover: 'rgba(255, 255, 255, 0.03)',
        },
        black: {
          DEFAULT: '#000000',
          soft: '#0a0a0a',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'scale-x': 'scaleX 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'gradient': 'gradient 6s ease infinite',
      },
      backdropBlur: {
        'xs': '2px',
      },
      letterSpacing: {
        'tightest': '-0.04em',
        'tighter': '-0.03em',
        'tight': '-0.02em',
      },
      fontWeight: {
        thin: '200',
        light: '300',
        normal: '400',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(circle at top, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
} 