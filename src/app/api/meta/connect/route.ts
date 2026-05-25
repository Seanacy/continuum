// GET /api/meta/connect — Start Facebook OAuth flow
// Returns the Facebook OAuth URL for the user to authorize

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getMetaOAuthUrl } from '@/lib/meta-auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const url = getMetaOAuthUrl(user.id)
    return NextResponse.json({ url })
  } catch (error: any) {
    console.error('Meta connect error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to start OAuth' },
      { status: 500 }
    )
  }
}
