import { NextRequest, NextResponse } from 'next/server'
import { runStateUpdate, runSignalInference } from '@/lib/background-loops'

export const dynamic = 'force-dynamic'

// Triggered by Vercel Cron or external scheduler
// Schedule: every 12 hours
// Runs both state update and signal inference together
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [stateResult, signalResult] = await Promise.all([
    runStateUpdate(),
    runSignalInference(),
  ])

  return NextResponse.json({
    success: true,
    stateUpdates: stateResult.processed,
    signalInferences: signalResult.processed,
  })
}
