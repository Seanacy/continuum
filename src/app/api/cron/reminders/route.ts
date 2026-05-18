import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push-sender'

export const dynamic = 'force-dynamic'

// Triggered by Vercel Cron every 1 minute
// Checks for due reminders and fires them as notifications
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all reminders that are due and haven't fired yet
    const dueReminders = await db.reminder.findMany({
      where: {
        fired: false,
        dueAt: { lte: new Date() },
      },
      include: {
        user: { select: { aiName: true } },
      },
    })

    let fired = 0

    for (const reminder of dueReminders) {
      try {
        // Create a notification for the user
        await db.notification.create({
          data: {
            userId: reminder.userId,
            type: 'reminder',
            content: reminder.content,
            referenceId: reminder.id,
          },
        })

        // Mark the reminder as fired
        await db.reminder.update({
          where: { id: reminder.id },
          data: { fired: true },
        })

        // Send a push notification
        const aiName = reminder.user?.aiName || 'Your AI'
        await sendPushToUser(reminder.userId, {
          title: aiName,
          body: reminder.content,
          tag: `reminder-${reminder.id}`,
          url: '/home',
        }).catch((err) => console.error('[Push] Send failed:', err))

        fired++
      } catch (err) {
        console.error(`[Reminders] Failed to fire reminder ${reminder.id}:`, err)
      }
    }

    return NextResponse.json({ success: true, checked: dueReminders.length, fired })
  } catch (error) {
    console.error('[Reminders] Cron error:', error)
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 })
  }
}
