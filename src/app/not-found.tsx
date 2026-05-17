import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-continuum-bg">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-continuum-muted">404</h1>
        <p className="text-continuum-muted">Nothing here.</p>
        <Link
          href="/home"
          className="inline-block px-6 py-2 rounded-lg bg-continuum-accent hover:bg-continuum-accent-dim transition text-white text-sm"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
