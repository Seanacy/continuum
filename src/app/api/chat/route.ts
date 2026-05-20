import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callLLM, LLMMessage, LLMContentBlock, WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL, SET_REMINDER_TOOL, ToolResultMessage } from '@/lib/llm'
import { buildSystemPrompt } from '@/lib/prompt-engine'
import { extractMemories } from '@/lib/memory-engine'
import { updateUserEnergy } from '@/lib/energy-matcher'
import { shouldCreateThread, createThread, updateThreadSummary } from '@/lib/thread-engine'
import { messageSchema } from '@/lib/validations'
import { searchWeb, searchImages } from '@/lib/tavily'
import { detectAndMarkReveals } from '@/lib/reveal-engine'
import { detectDiscoveryInResponse, checkForDiscoveryAnswer } from '@/lib/discovery-engine'
import { spendChatCredit } from '@/lib/credit-system'
import { logUsage } from '@/lib/usage-tracker'

export const dynamic = 'force-dynamic'

const CONTEXT_WINDOW = 20
const EXTRACTION_INTERVAL = 10
const MAX_TOOL_ROUNDS = 3 // max times Emily can search per message

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

  const { content, threadId, characterId, image, imageType, timezone, localTime } = parsed.data
  const partnerMode = body.partnerMode === true

  // Credit check — spend one chat credit (free messages first, then purchased)
  const creditSpend = await spendChatCredit(user.id)
  if (!creditSpend.allowed) {
    return NextResponse.json(
      {
        error: 'You\'re out of chat messages. Purchase video credits to get more — each video credit includes 50 chat messages.',
        rateLimited: true,
        remaining: 0,
        needsCredits: true,
      },
      { status: 429 }
    )
  }

  try {
    // 1. Update energy state
    await updateUserEnergy(user.id, content)

    // 2. Save user message (text only — images aren't stored in DB)
    const messageContent = image ? `[Sent an image] ${content}` : content
    await db.message.create({
      data: {
        userId: user.id,
        role: 'user',
        content: messageContent,
        threadId,
        characterId: characterId || null,
      },
    })

    // 3. Get recent message history
    const recentMessages = await db.message.findMany({
      where: {
        userId: user.id,
        ...(threadId ? { threadId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_WINDOW,
    })

    // Build history — all past messages as plain text
    const history: (LLMMessage | ToolResultMessage)[] = recentMessages
      .reverse()
      .slice(0, -1) // exclude the message we just saved (we'll add it with the image)
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    // Add the current message (with image if present)
    if (image && imageType) {
      const contentBlocks: LLMContentBlock[] = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageType,
            data: image,
          },
        },
        { type: 'text', text: content },
      ]
      history.push({ role: 'user', content: contentBlocks })
    } else {
      history.push({ role: 'user', content })
    }

    // 4. Fetch character(s) for prompt
    let activeCharacter = null
    let allCharacters: any[] = []
    try {
      allCharacters = await db.character.findMany({
        where: { userId: user.id, isActive: true },
        orderBy: { updatedAt: 'desc' },
      })
      if (characterId) {
        activeCharacter = allCharacters.find((c: any) => c.id === characterId) || allCharacters[0] || null
      } else {
        activeCharacter = allCharacters[0] || null
      }
    } catch {
      // Character fetch is optional
    }

    // Build system prompt
    const systemPrompt = await buildSystemPrompt({
      userId: user.id,
      aiName: activeCharacter?.name || user.aiName || 'Your AI',
      threadId,
      timezone,
      localTime,
      partnerMode,
      character: activeCharacter,
      allCharacters,
    })

    // 5. Call LLM with tool use loop
    // Emily can search the web, read results, and respond — up to MAX_TOOL_ROUNDS searches
    let totalTokens = 0
    let finalContent = ''
    const searchQueries: string[] = []
    const imageUrls: string[] = []
    let reminderSet: { content: string; dueAt: string } | null = null
    const tools = [
      SET_REMINDER_TOOL,
      ...(process.env.TAVILY_API_KEY ? [WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL] : []),
    ]

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await callLLM(systemPrompt, history, {
        maxTokens: 1024,
        temperature: 0.7,
        tools,
      })

      totalTokens += response.tokensUsed

      // If Claude wants to use a tool
      if (response.toolUse) {
        const toolName = response.toolUse.name
        let toolResultText: string = ''

        // --- SEARCH TOOLS ---
        if (toolName === 'web_search' || toolName === 'image_search') {
          const query = response.toolUse.input.query as string
          const isImageSearch = toolName === 'image_search'
          searchQueries.push(query)
          console.log(`[Search] Emily is ${isImageSearch ? 'image' : 'web'} searching: "${query}"`)

          try {
            if (isImageSearch) {
              const imageResults = await searchImages(query)
              if (imageResults.images.length > 0) {
                imageUrls.push(...imageResults.images.slice(0, 3))
                toolResultText = `Found ${imageResults.images.length} images. The images will be displayed to the user automatically. Here are the URLs:\n${imageResults.images.slice(0, 3).map((url, i) => `[${i + 1}] ${url}`).join('\n')}\n\nDescribe what the user asked about briefly. Do NOT include the URLs in your response — the images are shown automatically.`
              } else {
                toolResultText = 'No images found for this search.'
              }
            } else {
              const searchResults = await searchWeb(query)
              toolResultText = searchResults.results
                .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
                .join('\n\n')
              if (!toolResultText) {
                toolResultText = 'No results found for this search.'
              }
            }
          } catch (err) {
            console.error('[Search] Tavily error:', err)
            toolResultText = 'Search failed — unable to reach the search service right now.'
          }
        }

        // --- REMINDER TOOL ---
        else if (toolName === 'set_reminder') {
          const reminderContent = response.toolUse.input.content as string
          const dueInMinutes = response.toolUse.input.due_in_minutes as number
          const dueAt = new Date(Date.now() + dueInMinutes * 60 * 1000)
          console.log(`[Reminder] Emily is setting reminder: "${reminderContent}" due in ${dueInMinutes}m`)

          try {
            const reminder = await db.reminder.create({
              data: {
                userId: user.id,
                content: reminderContent,
                dueAt,
              },
            })
            // Format the due time nicely for Emily's confirmation
            const dueTimeStr = dueAt.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
            toolResultText = `Reminder set successfully. ID: ${reminder.id}. It will fire at ${dueTimeStr}. You can confirm this to the user naturally — don't repeat the exact time robotically, just acknowledge it conversationally.`
            reminderSet = { content: reminderContent, dueAt: dueAt.toISOString() }
          } catch (err) {
            console.error('[Reminder] DB error:', err)
            toolResultText = 'Failed to save the reminder — something went wrong on my end.'
          }
        }

        // --- UNKNOWN TOOL (shouldn't happen) ---
        else {
          toolResultText = `Unknown tool: ${toolName}`
        }

        // Push assistant message with tool_use block
        const assistantBlocks: unknown[] = []
        if (response.content) {
          assistantBlocks.push({ type: 'text', text: response.content })
        }
        assistantBlocks.push({
          type: 'tool_use',
          id: response.toolUse.id,
          name: response.toolUse.name,
          input: response.toolUse.input,
        })
        history.push({ role: 'assistant', content: assistantBlocks as LLMContentBlock[] })

        // Push tool result
        const toolResult: ToolResultMessage = {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: response.toolUse.id,
              content: toolResultText,
            },
          ],
        }
        history.push(toolResult)

        // Continue the loop — Claude will now process the results
        continue
      }

      // No tool use — Claude gave a final text response
      finalContent = response.content
      break
    }

    // 6. Save AI response (tagged with the active character)
    const aiMessage = await db.message.create({
      data: {
        userId: user.id,
        role: 'assistant',
        content: finalContent,
        threadId,
        characterId: activeCharacter?.id || null,
      },
    })

    // 7. Update AI state
    await db.aiState.update({
      where: { userId: user.id },
      data: { lastActiveAt: new Date() },
    })

    // 8. Log interaction + usage
    await db.interaction.create({
      data: {
        userId: user.id,
        type: image ? 'vision' : 'chat',
        metadata: JSON.stringify({
          threadId,
          tokensUsed: totalTokens,
          hasImage: !!image,
        }),
      },
    })

    // Log for rate limiting and analytics
    await logUsage(user.id, image ? 'vision' : 'chat', totalTokens, {
      threadId,
      searchCount: searchQueries.length,
    })

    // 9. Memory extraction
    const totalMessages = await db.message.count({
      where: { userId: user.id },
    })

    if (totalMessages % EXTRACTION_INTERVAL === 0) {
      const allRecent = await db.message.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: EXTRACTION_INTERVAL,
      })
      extractMemories(user.id, allRecent.reverse()).catch(console.error)
    }

    // 10. Auto-detect threads
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

    // 11. Detect capability reveals in the response (fire-and-forget)
    detectAndMarkReveals(user.id, finalContent).catch(console.error)

    // 12. Discovery system — check if Emily asked a question, check if user answered one
    detectDiscoveryInResponse(user.id, finalContent).catch(console.error)
    checkForDiscoveryAnswer(user.id, content).catch(console.error)

    // 12. Update thread summary
    if (threadId) {
      updateThreadSummary(threadId).catch(console.error)
    }

    return NextResponse.json({
      message: {
        id: aiMessage.id,
        role: 'assistant',
        content: finalContent,
        createdAt: aiMessage.createdAt,
        characterId: activeCharacter?.id || null,
        characterName: activeCharacter?.name || null,
      },
      tokensUsed: totalTokens,
      searchPerformed: searchQueries.length > 0,
      searchQuery: searchQueries[0] || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      reminderSet,
      remaining: creditSpend.remaining,
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
    include: {
      character: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    messages: messages.reverse().map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      characterId: m.characterId,
      characterName: m.character?.name || null,
    })),
  })
}
