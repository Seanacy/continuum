import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Continuum',
  description: 'Your persistent AI presence',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-continuum-bg text-continuum-text min-h-screen">
        {children}
      </body>
    </html>
  )
}
