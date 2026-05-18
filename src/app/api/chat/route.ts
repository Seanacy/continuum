import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callLLM, LLMMessage, LLMContentBlock, WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL, ToolResultMessage } from '@/lib/llm'
import { buildSystemPrompt } from '@/lib/prompt-engine'
import { extractMemories } from '@/lib/memory-engine'
import { updateUserEnergy } from '@/lib/energy-matcher'
import { shouldCreateThread, createThread, updateThreadSummary } from '@/lib/thread-engine'
import { messageSchema } from '@/lib/validations'
import { searchWeb, searchImages } from '@/lib/tavily'

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

  const { content, threadId, image, imageType } = parsed.data

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

    // 4. Build system prompt
    const systemPrompt = await buildSystemPrompt({
      userId: user.id,
      aiName: user.aiName || 'Your AI',
      threadId,
    })

    // 5. Call LLM with tool use loop
    // Emily can search the web, read results, and respond — up to MAX_TOOL_ROUNDS searches
    let totalTokens = 0
    let finalContent = ''
    const searchQueries: string[] = []
    const imageUrls: string[] = []
    const tools = process.env.TAVILY_API_KEY ? [WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL] : []

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await callLLM(systemPrompt, history, {
        maxTokens: 1024,
        temperature: 0.7,
        tools,
      })

      totalTokens += response.tokensUsed

      // If Claude wants to use a tool (web search or image search)
      if (response.toolUse && (response.toolUse.name === 'web_search' || response.toolUse.name === 'image_search')) {
        const query = response.toolUse.input.query as string
        const isImageSearch = response.toolUse.name === 'image_search'
        searchQueries.push(query)
        console.log(`[Search] Emily is ${isImageSearch ? 'image' : 'web'} searching: "${query}"`)

        let toolResultText: string
        try {
          if (isImageSearch) {
            const imageResults = await searchImages(query)
            if (imageResults.images.length > 0) {
              // Store image URLs to return to the frontend
              imageUrls.push(...imageResults.images.slice(0, 3))
              // Tell Claude about the images so it can describe them
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

    // 6. Save AI response
    const aiMessage = await db.message.create({
      data: {
        userId: user.id,
        role: 'assistant',
        content: finalContent,
        threadId,
      },
    })

    // 7. Update AI state
    await db.aiState.update({
      where: { userId: user.id },
      data: { lastActiveAt: new Date() },
    })

    // 8. Log interaction
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

    // 11. Update thread summary
    if (threadId) {
      updateThreadSummary(threadId).catch(console.error)
    }

    return NextResponse.json({
      message: {
        id: aiMessage.id,
        role: 'assistant',
        content: finalContent,
        createdAt: aiMessage.createdAt,
      },
      tokensUsed: totalTokens,
      searchPerformed: searchQueries.length > 0,
      searchQuery: searchQueries[0] || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
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
