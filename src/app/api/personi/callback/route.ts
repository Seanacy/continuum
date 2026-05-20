import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { syncCharacterFromPersoni } from '@/lib/personi-integration'

export const dynamic = 'force-dynamic'

// GET — Personi redirects back here after character is built
// URL: /api/personi/callback?character_id=xxx
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    // Redirect to login if not authenticated
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = new URL(req.url)
  const personiCharId = searchParams.get('character_id')

  if (!personiCharId) {
    // User cancelled or something went wrong — redirect back to app
    return NextResponse.redirect(new URL('/?tab=character&error=no_character', req.url))
  }

  // Sync the character from Personi to Continuum
  const result = await syncCharacterFromPersoni(user.id, personiCharId)

  if (!result.success) {
    return NextResponse.redirect(new URL('/?tab=character&error=sync_failed', req.url))
  }

  // Success — redirect to character page to upload profile pics
  return NextResponse.redirect(new URL(`/?tab=character&id=${result.characterId}&synced=true`, req.url))
}
