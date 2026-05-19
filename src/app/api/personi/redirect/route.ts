import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { buildPersoniRedirectUrl } from '@/lib/personi-integration'

export const dynamic = 'force-dynamic'

// GET — redirect user to Personi to build a character
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const redirectUrl = buildPersoniRedirectUrl(user.id, user.email)
  return NextResponse.json({ url: redirectUrl })
}
