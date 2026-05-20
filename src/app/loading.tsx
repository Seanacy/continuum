export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-continuum-bg">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-continuum-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-continuum-muted">Loading...</p>
      </div>
    </div>
  )
}
