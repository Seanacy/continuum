// Push Notification Client
// Handles service worker registration and push subscription on the browser side

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  } catch (err) {
    console.error('[Push] Service worker registration failed:', err)
    return null
  }
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    // 1. Get VAPID public key from server
    const keyRes = await fetch('/api/push')
    if (!keyRes.ok) return false
    const { vapidPublicKey } = await keyRes.json()
    if (!vapidPublicKey) return false

    // 2. Register service worker
    const reg = await registerServiceWorker()
    if (!reg) return false

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready

    // 3. Subscribe to push
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    // 4. Send subscription to server
    const subJson = subscription.toJSON()
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    })

    return res.ok
  } catch (err) {
    console.error('[Push] Subscribe failed:', err)
    return false
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return true

    const subscription = await reg.pushManager.getSubscription()
    if (!subscription) return true

    // Remove from server
    await fetch('/api/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })

    // Unsubscribe locally
    await subscription.unsubscribe()
    return true
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err)
    return false
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// Helper — convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
