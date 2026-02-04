/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cosmic deep space palette
        void: {
          950: '#030308',
          900: '#0a0a14',
          850: '#0f0f1f',
          800: '#14142a',
          700: '#1a1a3a',
          600: '#24244a',
        },
        // Stellar accent - warm golden starlight
        stellar: {
          50: '#fff9eb',
          100: '#ffefc6',
          200: '#ffdd88',
          300: '#ffc94a',
          400: '#ffb420',
          500: '#f99307',
          600: '#dd6d02',
          700: '#b74a06',
          800: '#94390c',
          900: '#7a2f0d',
        },
        // Nebula accent - ethereal purple/pink
        nebula: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        },
        // Element colors (HSR-inspired)
        element: {
          physical: '#c4c4c4',
          fire: '#f4634e',
          ice: '#47c7fd',
          lightning: '#d376f0',
          wind: '#5fe8b6',
          quantum: '#625afa',
          imaginary: '#f3d86b',
        },
        // Tier colors
        tier: {
          ss: '#ff9500',
          splus: '#ffd000',
          s: '#a855f7',
          a: '#3b82f6',
          b: '#22c55e',
          c: '#6b7280',
        },
        // Recommendation tier colors
        rec: {
          bis: '#fbbf24',      // Gold
          generalist: '#a1a1aa', // Silver
          f2p: '#4ade80',       // Green
        }
      },
      fontFamily: {
        // Display font: futuristic, geometric
        display: ['Orbitron', 'ui-sans-serif', 'system-ui'],
        // Body font: clean, readable
        body: ['Exo 2', 'ui-sans-serif', 'system-ui'],
        // Mono for scores/numbers
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'cosmic-gradient': 'radial-gradient(ellipse at top, #1a1a3a 0%, #0a0a14 50%, #030308 100%)',
        'nebula-glow': 'radial-gradient(circle at 30% 20%, rgba(168, 85, 247, 0.15) 0%, transparent 50%)',
        'stellar-burst': 'radial-gradient(circle at 70% 80%, rgba(249, 147, 7, 0.1) 0%, transparent 40%)',
        'card-shimmer': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(255,255,255,0.03) 100%)',
      },
      boxShadow: {
        'glow-stellar': '0 0 20px rgba(249, 147, 7, 0.3), 0 0 40px rgba(249, 147, 7, 0.1)',
        'glow-nebula': '0 0 20px rgba(168, 85, 247, 0.3), 0 0 40px rgba(168, 85, 247, 0.1)',
        'glow-bis': '0 0 15px rgba(251, 191, 36, 0.4)',
        'glow-element-fire': '0 0 12px rgba(244, 99, 78, 0.5)',
        'glow-element-ice': '0 0 12px rgba(71, 199, 253, 0.5)',
        'glow-element-lightning': '0 0 12px rgba(211, 118, 240, 0.5)',
        'glow-element-wind': '0 0 12px rgba(95, 232, 182, 0.5)',
        'glow-element-quantum': '0 0 12px rgba(98, 90, 250, 0.5)',
        'glow-element-imaginary': '0 0 12px rgba(243, 216, 107, 0.5)',
        'glow-element-physical': '0 0 12px rgba(196, 196, 196, 0.5)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 3s ease-in-out infinite',
        'star-twinkle': 'star-twinkle 4s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'slide-in-right': 'slide-in-right 0.4s ease-out',
        'scale-in': 'scale-in 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'score-fill': 'score-fill 1s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.2)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'star-twinkle': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'score-fill': {
          '0%': { width: '0%' },
          '100%': { width: 'var(--score-width)' },
        },
      },
      borderRadius: {
        'card': '1rem',
        'portrait': '0.75rem',
      },
      backdropBlur: {
        'card': '12px',
      },
    },
  },
  plugins: [],
}
