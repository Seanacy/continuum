import { NextRequest, NextResponse } from 'next/server'
import { runNotificationGeneration } from '@/lib/notification-engine'

// Triggered by Vercel Cron or external scheduler
// Schedule: every 8 hours (3x/day to stay within 2/day limit per user)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runNotificationGeneration()
  return NextResponse.json({ success: true, ...result })
}
