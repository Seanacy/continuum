'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-continuum-bg px-4">
      <div className="text-center space-y-4 max-w-sm">
        <h2 className="text-xl font-bold text-continuum-text">Something broke</h2>
        <p className="text-sm text-continuum-muted">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 rounded-lg bg-continuum-accent hover:bg-continuum-accent-dim transition text-white text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
