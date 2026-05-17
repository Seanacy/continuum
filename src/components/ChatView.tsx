'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@/lib/hooks'

export default function ChatView({ threadId }: { threadId?: string }) {
  const { messages, loading, sending, sendMessage } = useChat(threadId)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    await sendMessage(msg)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-continuum-muted">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-continuum-muted pt-20">
            <p className="text-lg">Start talking.</p>
            <p className="text-sm mt-1">This is a continuous conversation.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-continuum-accent text-white rounded-br-md'
                  : 'bg-continuum-surface border border-continuum-border text-continuum-text rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-continuum-surface border border-continuum-border px-4 py-2.5 rounded-2xl rounded-bl-md">
              <span className="text-continuum-muted text-sm animate-pulse">...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-continuum-border px-4 py-3"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say something..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-continuum-surface border border-continuum-border focus:border-continuum-accent outline-none text-sm transition"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="px-4 py-2.5 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim text-white text-sm font-medium transition disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
