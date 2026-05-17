// Thread Engine
// Manages ongoing conversation threads
// Threads are auto-detected from chat OR manually created
// Each thread maintains a running summary

import { db } from './db'
import { callLLM } from './llm'

// ============================================
// AUTO-DETECT — should this conversation become a thread?
// Called after chat responses when no thread is active
// ============================================
export async function shouldCreateThread(
  userId: string,
  recentMessages: { role: string; content: string }[]
): Promise<{ shouldCreate: boolean; title?: string }> {
  // Need at least 4 messages to consider threading
  if (recentMessages.length < 4) return { shouldCreate: false }

  const conversation = recentMessages
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  try {
    const result = await callLLM(
      `Analyze this conversation. Should it become a named thread (an ongoing topic that will span multiple sessions)?

A thread should be created when:
- There's a project being worked on over time
- A decision is being made that needs follow-up
- A goal is being tracked
- A recurring topic keeps coming up

A thread should NOT be created for:
- Casual small talk
- One-off questions
- Quick exchanges

Respond with JSON only:
{"shouldCreate": true/false, "title": "short title if yes"}`,
      [{ role: 'user', content: conversation }],
      { maxTokens: 100, temperature: 0.3 }
    )

    return JSON.parse(result.content)
  } catch {
    return { shouldCreate: false }
  }
}

// ============================================
// CREATE THREAD
// ============================================
export async function createThread(
  userId: string,
  title: string,
  initialSummary?: string
): Promise<string> {
  const thread = await db.thread.create({
    data: {
      userId,
      title,
      summary: initialSummary || null,
    },
  })

  return thread.id
}

// ============================================
// UPDATE THREAD SUMMARY
// Called periodically to keep the running summary current
// ============================================
export async function updateThreadSummary(threadId: string): Promise<void> {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })

  if (!thread || thread.messages.length < 3) return

  const conversation = thread.messages
    .reverse()
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
    .join('\n')

  try {
    const result = await callLLM(
      `Summarize this thread titled "${thread.title}" in 2-3 sentences. Capture: what's been discussed, any decisions made, and what's still open. Be concise.`,
      [{ role: 'user', content: conversation }],
      { maxTokens: 150, temperature: 0.3 }
    )

    await db.thread.update({
      where: { id: threadId },
      data: { summary: result.content.trim() },
    })
  } catch (error) {
    console.error('Thread summary update failed:', error)
  }
}

// ============================================
// RESOLVE THREAD — mark as done
// ============================================
export async function resolveThread(threadId: string, userId: string): Promise<boolean> {
  const thread = await db.thread.findUnique({ where: { id: threadId } })
  if (!thread || thread.userId !== userId) return false

  await db.thread.update({
    where: { id: threadId },
    data: { status: 'resolved' },
  })

  return true
}

// ============================================
// PAUSE THREAD — temporarily shelve
// ============================================
export async function pauseThread(threadId: string, userId: string): Promise<boolean> {
  const thread = await db.thread.findUnique({ where: { id: threadId } })
  if (!thread || thread.userId !== userId) return false

  await db.thread.update({
    where: { id: threadId },
    data: { status: 'paused' },
  })

  return true
}

// ============================================
// RESUME THREAD
// ============================================
export async function resumeThread(threadId: string, userId: string): Promise<boolean> {
  const thread = await db.thread.findUnique({ where: { id: threadId } })
  if (!thread || thread.userId !== userId) return false

  await db.thread.update({
    where: { id: threadId },
    data: { status: 'active' },
  })

  return true
}
