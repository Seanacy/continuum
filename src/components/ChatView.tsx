'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '@/lib/hooks'

// ============================================
// Voice Output — Text-to-Speech
// ============================================
function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(false)

  const speakText = useCallback((text: string, msgId?: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1.0

    // Use saved voice preference, fall back to defaults
    const voices = window.speechSynthesis.getVoices()
    const savedVoiceName = typeof window !== 'undefined' ? localStorage.getItem('continuum-voice') : null
    const savedVoice = savedVoiceName ? voices.find((v) => v.name === savedVoiceName) : null
    const fallback = voices.find(
      (v) => v.name.includes('Samantha') || v.name.includes('Google UK English') || v.name.includes('Daniel')
    )
    if (savedVoice) utterance.voice = savedVoice
    else if (fallback) utterance.voice = fallback

    utterance.onstart = () => { setSpeaking(true); setSpeakingMsgId(msgId || null) }
    utterance.onend = () => { setSpeaking(false); setSpeakingMsgId(null) }
    utterance.onerror = () => { setSpeaking(false); setSpeakingMsgId(null) }
    window.speechSynthesis.speak(utterance)
  }, [])

  // Auto-speak wrapper (respects voiceEnabled toggle)
  const speak = useCallback((text: string) => {
    if (!voiceEnabled) return
    speakText(text)
  }, [voiceEnabled, speakText])

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      setSpeakingMsgId(null)
    }
  }, [])

  return { speaking, speakingMsgId, voiceEnabled, setVoiceEnabled, speak, speakText, stop }
}

// ============================================
// Voice Input — Speech-to-Text
// ============================================
function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Your browser does not support voice input. Try Chrome or Safari.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      onResult(transcript)
      setListening(false)
    }

    recognition.onerror = () => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [onResult])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, startListening, stopListening }
}

// ============================================
// Camera Capture
// ============================================
function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (base64: string, mimeType: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setReady(true)
      }
    } catch {
      alert('Could not access camera. Please allow camera permissions.')
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [facingMode, startCamera])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    const base64 = dataUrl.split(',')[1]
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
    onCapture(base64, 'image/jpeg')
  }

  function flipCamera() {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
    setReady(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="flex-1 object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-xl"
        >
          &times;
        </button>
        {/* Capture */}
        <button
          onClick={capture}
          disabled={!ready}
          className="w-16 h-16 rounded-full border-4 border-white bg-white/30 backdrop-blur disabled:opacity-30 transition"
        />
        {/* Flip */}
        <button
          onClick={flipCamera}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-sm"
        >
          Flip
        </button>
      </div>
    </div>
  )
}

// ============================================
// Main ChatView
// ============================================
export default function ChatView({ threadId, partnerMode }: { threadId?: string; partnerMode?: boolean }) {
  const { messages, loading, sending, searching, sendMessage } = useChat(threadId)
  const [input, setInput] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { speaking, speakingMsgId, voiceEnabled, setVoiceEnabled, speak, speakText, stop } = useSpeech()

  // Track last AI message to auto-speak
  const lastAiMsgRef = useRef<string>('')

  const handleVoiceResult = useCallback((text: string) => {
    setInput(text)
  }, [])

  const { listening, startListening, stopListening } = useVoiceInput(handleVoiceResult)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-speak new AI messages
  useEffect(() => {
    if (!voiceEnabled || messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === 'assistant' && lastMsg.content !== lastAiMsgRef.current) {
      lastAiMsgRef.current = lastMsg.content
      speak(lastMsg.content)
    }
  }, [messages, voiceEnabled, speak])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if ((!input.trim() && !pendingImage) || sending) return
    const msg = input.trim() || (pendingImage ? 'What do you see?' : '')
    setInput('')

    const image = pendingImage?.base64
    const imageType = pendingImage?.mimeType
    setPendingImage(null)

    await sendMessage(msg, image, imageType, partnerMode)
  }

  function handleCapture(base64: string, mimeType: string) {
    setPendingImage({ base64, mimeType })
    setShowCamera(false)
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
      {/* Camera Modal */}
      {showCamera && (
        <CameraModal
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-continuum-muted pt-20">
            <p className="text-lg">Start talking.</p>
            <p className="text-sm mt-1">Type, speak, or show me something.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex items-end gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-continuum-accent/90 text-white rounded-br-md bubble-user'
                    : 'text-continuum-text rounded-bl-md bubble-ai'
                }`}
              >
                {msg.role === 'assistant' && msg.searchQuery && (
                  <span className="flex items-center gap-1.5 text-xs text-continuum-accent mb-2 pb-1.5 border-b border-continuum-border">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    Searched: {msg.searchQuery}
                  </span>
                )}
                {msg.role === 'assistant' && msg.reminderSet && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 mb-2 pb-1.5 border-b border-continuum-border">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Reminder set
                  </span>
                )}
                {msg.content.startsWith('[Sent an image]') ? (
                  <>
                    <span className="text-xs opacity-60 block mb-1">📷 Image sent</span>
                    <span>{msg.content.replace('[Sent an image] ', '')}</span>
                  </>
                ) : (
                  msg.content
                )}
                {msg.role === 'assistant' && msg.imageUrls && msg.imageUrls.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.imageUrls.map((url, i) => (
                      <div key={i} className="relative">
                        <img
                          src={url}
                          alt={`Search result ${i + 1}`}
                          className="rounded-lg max-w-full max-h-64 object-cover border border-continuum-border"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement
                            img.style.display = 'none'
                            const fallback = img.nextElementSibling as HTMLElement
                            if (fallback) fallback.style.display = 'flex'
                          }}
                        />
                        <div
                          className="hidden items-center gap-2 px-3 py-2 rounded-lg bg-continuum-surface border border-continuum-border text-continuum-muted text-xs"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          Couldn&#39;t load this image
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => {
                    if (speakingMsgId === msg.id) {
                      stop()
                    } else {
                      speakText(msg.content, msg.id)
                    }
                  }}
                  className={`flex-shrink-0 p-1.5 rounded-lg transition ${
                    speakingMsgId === msg.id
                      ? 'text-continuum-accent animate-pulse'
                      : 'text-continuum-muted hover:text-continuum-accent'
                  }`}
                  title={speakingMsgId === msg.id ? 'Stop speaking' : 'Read aloud'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {speakingMsgId === msg.id ? (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </>
                    ) : (
                      <>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </>
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bubble-thinking">
              {searching ? (
                <span className="flex items-center gap-2 text-continuum-accent text-sm animate-pulse">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" style={{ animationDuration: '2s' }}>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Searching the web...
                </span>
              ) : (
                <span className="text-continuum-muted text-sm animate-pulse">Thinking...</span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Pending Image Preview */}
      {pendingImage && (
        <div className="px-4 py-2 border-t border-continuum-border flex items-center gap-3">
          <img
            src={`data:image/jpeg;base64,${pendingImage.base64}`}
            alt="Preview"
            className="w-16 h-16 rounded-lg object-cover"
          />
          <span className="text-xs text-continuum-muted flex-1">Image attached</span>
          <button
            onClick={() => setPendingImage(null)}
            className="text-continuum-muted hover:text-white text-sm"
          >
            Remove
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-continuum-border px-4 py-3"
      >
        <div className="flex gap-2 items-center">
          {/* Camera Button */}
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="p-2.5 rounded-xl bg-continuum-surface border border-continuum-border hover:border-continuum-accent text-continuum-muted hover:text-continuum-accent transition"
            title="Open camera"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          {/* Mic Button */}
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`p-2.5 rounded-xl border transition ${
              listening
                ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                : 'bg-continuum-surface border-continuum-border text-continuum-muted hover:border-continuum-accent hover:text-continuum-accent'
            }`}
            title={listening ? 'Stop listening' : 'Voice input'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? 'Listening...' : 'Say something...'}
            className="flex-1 px-4 py-2.5 rounded-xl bg-continuum-surface border border-continuum-border focus:border-continuum-accent outline-none text-sm transition"
            disabled={sending || listening}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={(!input.trim() && !pendingImage) || sending}
            className="px-4 py-2.5 rounded-xl bg-continuum-accent hover:bg-continuum-accent-dim text-white text-sm font-medium transition disabled:opacity-30"
          >
            Send
          </button>

          {/* Voice Toggle */}
          <button
            type="button"
            onClick={() => {
              if (speaking) stop()
              setVoiceEnabled(!voiceEnabled)
            }}
            className={`p-2.5 rounded-xl border transition ${
              voiceEnabled
                ? 'bg-continuum-accent/20 border-continuum-accent text-continuum-accent'
                : 'bg-continuum-surface border-continuum-border text-continuum-muted hover:border-continuum-accent hover:text-continuum-accent'
            }`}
            title={voiceEnabled ? 'Disable voice responses' : 'Enable voice responses'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {voiceEnabled ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Status bar */}
        {(listening || speaking) && (
          <div className="mt-2 text-xs text-continuum-muted text-center">
            {listening && (
              <span className="text-red-400 animate-pulse">Listening... speak now</span>
            )}
            {speaking && (
              <span className="text-continuum-accent animate-pulse">Speaking...</span>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
