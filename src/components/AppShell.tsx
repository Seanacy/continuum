'use client'

import { useState } from 'react'
import { useNotifications } from '@/lib/hooks'
import NotificationPanel from './NotificationPanel'

type View = 'chat' | 'feed' | 'threads' | 'settings'

export default function AppShell({
  aiName,
  children,
  activeView,
  onViewChange,
  partnerMode,
  onPartnerModeToggle,
}: {
  aiName: string
  children: React.ReactNode
  activeView: View
  onViewChange: (view: View) => void
  partnerMode?: boolean
  onPartnerModeToggle?: () => void
}) {
  const { unreadCount } = useNotifications()
  const [showNotifs, setShowNotifs] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-continuum-bg relative" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-continuum-border relative">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-continuum-accent">{aiName}</h1>
          {activeView === 'chat' && onPartnerModeToggle && (
            <button
              onClick={onPartnerModeToggle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                partnerMode
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                  : 'bg-continuum-surface border border-continuum-border text-continuum-muted hover:border-amber-500/30 hover:text-amber-400/70'
              }`}
              title={partnerMode ? 'Creative Partner mode ON' : 'Turn on Creative Partner mode'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Create
            </button>
          )}
        </div>
        {/* Centered app name */}
        <span className="absolute left-1/2 -translate-x-1/2 text-sm font-light tracking-widest uppercase text-continuum-muted/60 pointer-events-none select-none">
          Continuum
        </span>
        <button
          onClick={() => setShowNotifs(!showNotifs)}
          className="relative p-2 rounded-lg hover:bg-continuum-surface transition"
        >
          <svg
            className="w-5 h-5 text-continuum-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[10px] rounded-full bg-continuum-accent text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* Notification panel */}
      {showNotifs && <NotificationPanel onClose={() => setShowNotifs(false)} />}

      {/* Content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Bottom nav */}
      <nav className="flex border-t border-continuum-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <NavButton
          label="Chat"
          active={activeView === 'chat'}
          onClick={() => onViewChange('chat')}
        />
        <NavButton
          label="Feed"
          active={activeView === 'feed'}
          onClick={() => onViewChange('feed')}
        />
        <NavButton
          label="Threads"
          active={activeView === 'threads'}
          onClick={() => onViewChange('threads')}
        />
        <NavButton
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onViewChange('settings')}
        />
      </nav>
    </div>
  )
}

function NavButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-medium transition ${
        active
          ? 'text-continuum-accent border-t-2 border-continuum-accent'
          : 'text-continuum-muted hover:text-continuum-text'
      }`}
    >
      {label}
    </button>
  )
}
