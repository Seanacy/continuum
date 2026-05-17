import { NextRequest, NextResponse } from 'next/server'
import { runMemoryRollup } from '@/lib/background-loops'

// Triggered by Vercel Cron or external scheduler
// Schedule: every 12 hours
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runMemoryRollup()
  return NextResponse.json({ success: true, ...result })
}
