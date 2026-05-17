import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callLLM, LLMMessage } from '@/lib/llm'
import { buildSystemPrompt } from '@/lib/prompt-engine'
import { extractMemories } from '@/lib/memory-engine'
import { updateUserEnergy } from '@/lib/energy-matcher'
import { shouldCreateThread, createThread, updateThreadSummary } from '@/lib/thread-engine'
import { messageSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

const CONTEXT_WINDOW = 20 // last N messages sent to LLM
const EXTRACTION_INTERVAL = 10 // extract memories every N messages

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    )
  }

  const { content, threadId } = parsed.data

  try {
    // 1. Update energy state (silent, no LLM call)
    await updateUserEnergy(user.id, content)

    // 2. Save user message
    await db.message.create({
      data: {
        userId: user.id,
        role: 'user',
        content,
        threadId,
      },
    })

    // 3. Get recent message history for context
    const recentMessages = await db.message.findMany({
      where: {
        userId: user.id,
        ...(threadId ? { threadId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_WINDOW,
    })

    // Reverse to chronological order
    const history: LLMMessage[] = recentMessages
      .reverse()
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    // 4. Build system prompt (personality + memory + rules)
    const systemPrompt = await buildSystemPrompt({
      userId: user.id,
      aiName: user.aiName || 'Your AI',
      threadId,
    })

    // 5. Call LLM
    const response = await callLLM(systemPrompt, history, {
      maxTokens: 1024,
      temperature: 0.7,
    })

    // 6. Save AI response
    const aiMessage = await db.message.create({
      data: {
        userId: user.id,
        role: 'assistant',
        content: response.content,
        threadId,
      },
    })

    // 7. Update AI state (last active)
    await db.aiState.update({
      where: { userId: user.id },
      data: { lastActiveAt: new Date() },
    })

    // 8. Log interaction
    await db.interaction.create({
      data: {
        userId: user.id,
        type: 'chat',
        metadata: JSON.stringify({
          threadId,
          tokensUsed: response.tokensUsed,
        }),
      },
    })

    // 9. Check if it's time to extract memories (every N messages)
    const totalMessages = await db.message.count({
      where: { userId: user.id },
    })

    if (totalMessages % EXTRACTION_INTERVAL === 0) {
      // Run memory extraction in background (don't await — non-blocking)
      const allRecent = await db.message.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: EXTRACTION_INTERVAL,
      })
      extractMemories(user.id, allRecent.reverse()).catch(console.error)
    }

    // 10. Auto-detect threads (only if not already in a thread)
    if (!threadId && totalMessages > 4 && totalMessages % 5 === 0) {
      const recentForThread = await db.message.findMany({
        where: { userId: user.id, threadId: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
      })
      const detection = await shouldCreateThread(
        user.id,
        recentForThread.reverse().map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        }))
      )
      if (detection.shouldCreate && detection.title) {
        createThread(user.id, detection.title).catch(console.error)
      }
    }

    // 11. Update thread summary if in a thread
    if (threadId) {
      updateThreadSummary(threadId).catch(console.error)
    }

    return NextResponse.json({
      message: {
        id: aiMessage.id,
        role: 'assistant',
        content: response.content,
        createdAt: aiMessage.createdAt,
      },
      tokensUsed: response.tokensUsed,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}

// GET — retrieve chat history
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const threadId = searchParams.get('threadId')
  const limit = parseInt(searchParams.get('limit') || '50')
  const cursor = searchParams.get('cursor')

  const messages = await db.message.findMany({
    where: {
      userId: user.id,
      ...(threadId ? { threadId } : { threadId: null }),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ messages: messages.reverse() })
}
