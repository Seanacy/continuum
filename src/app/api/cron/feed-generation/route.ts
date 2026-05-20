import { NextRequest, NextResponse } from 'next/server'
import { runFeedGeneration } from '@/lib/background-loops'

export const dynamic = 'force-dynamic'

// Triggered by Vercel Cron or external scheduler
// Schedule: every 6 hours
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runFeedGeneration()
  return NextResponse.json({ success: true, ...result })
}
