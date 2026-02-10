/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        editor: {
          bg: '#0A0A0A',
          surface: '#141414',
          panel: '#1A1A1A',
          border: '#262626',
          'border-light': '#333333',
          hover: '#1F1F1F',
          active: '#2A2A2A',
          text: '#F5F5F5',
          'text-muted': '#999999',
          'text-dim': '#666666',
          accent: '#0EA5E9',
          'accent-hover': '#38BDF8',
          'accent-dim': '#0C4A6E',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
        },
      },
      animation: {
        'voice-pulse': 'voice-pulse 2s ease-in-out infinite',
        'voice-wave': 'voice-wave 1s ease-in-out infinite',
        'voice-mic-glow': 'voice-mic-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'voice-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0', transform: 'scale(2)' },
        },
        'voice-wave': {
          '0%, 100%': { height: '4px' },
          '50%': { height: '12px' },
        },
        'voice-mic-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
          '50%': { boxShadow: '0 0 8px 2px rgba(16, 185, 129, 0.25)' },
        },
      },
      spacing: {
        'timeline-ruler': '32px',
        'track-height': '64px',
      },
    },
  },
  plugins: [],
};
