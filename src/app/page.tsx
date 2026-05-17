export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-continuum-accent">Continuum</h1>
        <p className="text-continuum-muted text-lg">Your persistent AI presence</p>
        <div className="flex gap-4 justify-center pt-4">
          <a
            href="/login"
            className="px-6 py-2 rounded-lg bg-continuum-surface border border-continuum-border hover:border-continuum-accent transition"
          >
            Log in
          </a>
          <a
            href="/signup"
            className="px-6 py-2 rounded-lg bg-continuum-accent hover:bg-continuum-accent-dim transition text-white"
          >
            Get started
          </a>
        </div>
      </div>
    </main>
  )
}
