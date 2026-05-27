import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        continuum: {
          bg: '#141418',
          surface: '#1a1b22',
          border: '#1e2028',
          text: '#d4dce8',
          muted: '#6a7a8a',
          accent: '#6366f1',
          'accent-dim': '#4f5de6',
        },
      },
    },
  },
  plugins: [],
}
export default config
