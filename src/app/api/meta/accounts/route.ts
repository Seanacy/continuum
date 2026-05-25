// GET /api/meta/accounts — List connected Facebook accounts
// DELETE /api/meta/accounts — Disconnect a Facebook account

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getUserFacebookAccounts, disconnectFacebookAccount } from '@/lib/meta-auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accounts = await getUserFacebookAccounts(user.id)
    return NextResponse.json({ accounts })
  } catch (error: any) {
    console.error('Meta accounts error:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { accountId } = await req.json()
    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 })
    }

    const success = await disconnectFacebookAccount(accountId, user.id)
    if (!success) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Meta disconnect error:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
