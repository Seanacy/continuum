'use client'

import { useNotifications } from '@/lib/hooks'

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, markRead } = useNotifications()

  function handleMarkAll() {
    const ids = notifications.map((n) => n.id)
    if (ids.length > 0) markRead(ids)
  }

  return (
    <div className="absolute top-14 right-4 w-80 max-h-96 overflow-y-auto bg-continuum-surface border border-continuum-border rounded-xl shadow-2xl z-50">
      <div className="flex items-center justify-between p-3 border-b border-continuum-border">
        <span className="text-sm font-medium">Notifications</span>
        <div className="flex gap-2">
          {notifications.length > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs text-continuum-muted hover:text-continuum-accent transition"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-continuum-muted hover:text-continuum-text transition"
          >
            Close
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="p-6 text-center text-continuum-muted text-sm">
          No new notifications
        </div>
      ) : (
        <div className="divide-y divide-continuum-border">
          {notifications.map((notif) => (
            <div key={notif.id} className="p-3">
              <p className="text-sm text-continuum-text">{notif.content}</p>
              <span className="text-xs text-continuum-muted mt-1 block">
                {getTimeAgo(new Date(notif.createdAt))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
