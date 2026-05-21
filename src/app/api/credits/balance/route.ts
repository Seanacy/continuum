import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getWalletBalance } from '@/lib/credit-system'

export const dynamic = 'force-dynamic'

// GET — check current wallet balance (in dollars)
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const balance = await getWalletBalance(user.id)
  return NextResponse.json(balance)
}
