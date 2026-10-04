/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
    "../../packages/ui/src/**/*.{html,ts}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#090d16',
          panel: '#0f172a',
          elevated: '#1e293b',
          hover: '#334155',
          active: '#475569',
          border: '#1e293b',
          borderHighlight: '#334155',
          borderFocus: '#3b82f6',
          primary: '#f8fafc',
          secondary: '#94a3b8',
          muted: '#64748b'
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          active: '#1d4ed8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}
