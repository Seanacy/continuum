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
          bg: '#0a0a0f',
          surface: '#14141f',
          border: '#1e1e2e',
          text: '#e4e4e7',
          muted: '#71717a',
          accent: '#8b5cf6',
          'accent-dim': '#6d28d9',
        },
      },
    },
  },
  plugins: [],
}
export default config
