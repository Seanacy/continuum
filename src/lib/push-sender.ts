// Push Notification Sender
// Sends web push notifications to subscribed users
// Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL env vars

import webpush from 'web-push'
import { db } from './db'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return true

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL || 'mailto:noreply@example.com'

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys not configured — push notifications disabled')
    return false
  }

  webpush.setVapidDetails(email, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; tag?: string; url?: string }
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) return { sent: 0, failed: 0 }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload)
      )
      sent++
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      // 410 Gone or 404 = subscription expired, remove it
      if (statusCode === 410 || statusCode === 404) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      }
      failed++
      console.error(`[Push] Failed to send to ${sub.endpoint.slice(0, 50)}:`, statusCode || err)
    }
  }

  return { sent, failed }
}
