import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callLLM, LLMMessage, LLMContentBlock, WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL, SET_REMINDER_TOOL, GENERATE_CONTENT_TOOL, IMAGE_GENERATION_TOOL, OPEN_CHARACTER_BUILDER_TOOL, GENERATE_CONTENT_PACK_TOOL, ToolResultMessage } from '@/lib/llm'
import { buildSystemPrompt } from '@/lib/prompt-engine'
import { extractMemories } from '@/lib/memory-engine'
import { updateUserEnergy } from '@/lib/energy-matcher'
import { shouldCreateThread, createThread, updateThreadSummary } from '@/lib/thread-engine'
import { messageSchema } from '@/lib/validations'
import { searchWeb, searchImages } from '@/lib/tavily'
import { detectAndMarkReveals } from '@/lib/reveal-engine'
import { detectDiscoveryInResponse, checkForDiscoveryAnswer } from '@/lib/discovery-engine'
import { chargeAmount } from '@/lib/credit-system'
import { generateImage } from '@/lib/image-engine'
import { logUsage } from '@/lib/usage-tracker'

export const dynamic = 'force-dynamic'

const CONTEXT_WINDOW = 20
const DAILY_MESSAGE_LIMIT = 25
const EXTRACTION_INTERVAL = 10
const MAX_TOOL_ROUNDS = 3 // max times Emily can search per message

// Content generation pricing (in cents) â placeholder prices
const CONTENT_PRICES: Record<string, number> = {
  social_post: 25,        // $0.25
  tweet: 25,              // $0.25
  instagram_caption: 25,  // $0.25
  linkedin_post: 25,      // $0.25
  blog_post: 50,          // $0.50
  article: 50,            // $0.50
  newsletter: 50,         // $0.50
}

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

    // Daily message cap
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayCount = await db.message.count({
      where: { userId: user.id, role: 'user', createdAt: { gte: todayStart } }
    })
    const remaining = Math.max(0, DAILY_MESSAGE_LIMIT - todayCount)
    if (remaining <= 0) {
      return NextResponse.json({
        error: 'daily_limit',
        remaining: 0,
        limit: DAILY_MESSAGE_LIMIT,
        resetsAt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
      }, { status: 429 })
    }

  try {
    // 1. Update energy state
    await updateUserEnergy(user.id, content)

    // 2. Save user message (text only â images aren't stored in DB)
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

    // Build history â all past messages as plain text
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
    let totalTokens = 0
    let finalContent = ''
    const searchQueries: string[] = []
    const imageUrls: string[] = []
    let reminderSet: { content: string; dueAt: string } | null = null
    let generatedContent: { contentType: string; platform?: string; topic: string; content: string; hashtags?: string[]; priceCents: number } | null = null
    let openCharacterBuilder: { suggestion?: string } | null = null
    let generatedImage: { url: string; prompt: string; width?: number; height?: number; priceCents: number } | null = null
    let contentPack: { pieces: any[]; weekTheme: string; totalPriceCents: number } | null = null
    const tools = [
      SET_REMINDER_TOOL,
      GENERATE_CONTENT_TOOL,
      IMAGE_GENERATION_TOOL,
      OPEN_CHARACTER_BUILDER_TOOL,
      GENERATE_CONTENT_PACK_TOOL,
      ...(process.env.TAVILY_API_KEY ? [WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL] : []),
    ]

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await callLLM(systemPrompt, history, {
        maxTokens: 4096,
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
                toolResultText = `Found ${imageResults.images.length} images. The images will be displayed to the user automatically. Here are the URLs:\n${imageResults.images.slice(0, 3).map((url, i) => `[${i + 1}] ${url}`).join('\n')}\n\nDescribe what the user asked about briefly. Do NOT include the URLs in your response â the images are shown automatically.`
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
            toolResultText = 'Search failed â unable to reach the search service right now.'
          }
        }

        // --- REMINDER TOOL ---
        else if (toolName === 'set_reminder') {
          const reminderContent = response.toolUse.input.content as string
          const dueInMinutes = response.toolUse.input.due_in_minutes as number
          const dueAt = new Date(Date.now() + dueInMinutes * 60 * 1000)
          console.log(`[Reminder] Setting reminder: "${reminderContent}" due in ${dueInMinutes}m`)

          try {
            const reminder = await db.reminder.create({
              data: {
                userId: user.id,
                content: reminderContent,
                dueAt,
              },
            })
            const dueTimeStr = dueAt.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
            toolResultText = `Reminder set successfully. ID: ${reminder.id}. It will fire at ${dueTimeStr}. You can confirm this to the user naturally â don't repeat the exact time robotically, just acknowledge it conversationally.`
            reminderSet = { content: reminderContent, dueAt: dueAt.toISOString() }
          } catch (err) {
            console.error('[Reminder] DB error:', err)
            toolResultText = 'Failed to save the reminder â something went wrong on my end.'
          }
        }

        // --- GENERATE CONTENT TOOL ---
        else if (toolName === 'generate_content') {
          const input = response.toolUse.input as Record<string, any>
          const contentType = input.content_type as string
          const topic = input.topic as string
          const genContent = input.generated_content as string
          const platform = input.platform as string | undefined
          const hashtags = input.hashtags as string[] | undefined
          const priceCents = CONTENT_PRICES[contentType] || 25

          console.log(`[Content] Generating ${contentType} about "${topic}" â charging ${priceCents} cents`)

          // Charge the user's wallet
          const charge = await chargeAmount(
            user.id,
            priceCents,
            `Content generation: ${contentType}`,
            { contentType, topic, platform }
          )

          if (charge.allowed) {
            generatedContent = {
              contentType,
              platform,
              topic,
              content: genContent,
              hashtags,
              priceCents,
            }
            toolResultText = `Content generated successfully. The user has been charged ${(priceCents / 100).toFixed(2)}. Remaining balance: ${(charge.remaining / 100).toFixed(2)}. The content will be displayed to the user in a styled card automatically. Give a brief, natural confirmation â don't repeat the full content back.`
          } else {
            toolResultText = `The user doesn't have enough funds to generate this content. They need ${(priceCents / 100).toFixed(2)} but only have ${(charge.remaining / 100).toFixed(2)}. Let them know they need to add funds to their wallet.`
          }
        }

        // --- IMAGE GENERATION TOOL ---
        else if (toolName === 'generate_image') {
          const prompt = response.toolUse.input.prompt as string
          const imageSize = response.toolUse.input.image_size as string | undefined
          console.log(`[ImageGen] Generating image: "${prompt.substring(0, 60)}..."`)

          const result = await generateImage(user.id, prompt, {
            imageSize: imageSize || 'landscape_4_3',
          })

          if (result.success && result.imageUrl) {
            generatedImage = {
              url: result.imageUrl,
              prompt: result.prompt || prompt,
              width: result.width,
              height: result.height,
              priceCents: 10,
            }
            toolResultText = `Image generated successfully! The image will be displayed to the user automatically. Charged $0.10. Describe what you created briefly and naturally â don't include the URL, the image shows up as a card.`
          } else {
            toolResultText = result.error || 'Image generation failed.'
          }
        }

        // --- OPEN CHARACTER BUILDER TOOL ---
        else if (toolName === 'open_character_builder') {
          const suggestion = response.toolUse.input.suggestion as string | undefined
          openCharacterBuilder = { suggestion }
          toolResultText = 'The character builder will open for the user. A button will appear in the chat for them to click. Confirm this naturally â tell them you\'re opening the character builder and they can customize their new AI there.'
        }

        // --- CONTENT PACK TOOL ---
            else if (toolName === 'generate_content_pack') {
              const input = response.toolUse.input as Record<string, any>
              const pieces = input.pieces as any[]
              const weekTheme = input.week_theme as string
              const piecePriceCents = 15 // $0.15 per piece
              const totalPriceCents = pieces.length * piecePriceCents

              console.log('[ContentPack] Generating ' + pieces.length + ' pieces, theme: "' + weekTheme + '" - charging ' + totalPriceCents + ' cents')

              const charge = await chargeAmount(
                user.id,
                totalPriceCents,
                'Content pack: ' + pieces.length + ' pieces',
                { weekTheme, pieceCount: pieces.length }
              )

              if (charge.allowed) {
                contentPack = {
                  pieces: pieces.map((p: any) => ({
                    contentType: p.content_type,
                    platform: p.platform,
                    content: p.content,
                    hashtags: p.hashtags || [],
                    needsUserPhoto: p.needs_user_photo || false,
                    photoSuggestion: p.photo_suggestion || null,
                    daySuggestion: p.day_suggestion || null,
                  })),
                  weekTheme,
                  totalPriceCents,
                }
                toolResultText = 'Content pack generated successfully with ' + pieces.length + ' pieces. Charged $' + (totalPriceCents / 100).toFixed(2) + '. Remaining balance: $' + (charge.remaining / 100).toFixed(2) + '. The content pack will display as cards the user can swipe through. Give a brief natural confirmation and mention the week theme. Do NOT repeat the content back.'
              } else {
                toolResultText = 'The user does not have enough funds for this content pack. They need $' + (totalPriceCents / 100).toFixed(2) + ' but only have $' + (charge.remaining / 100).toFixed(2) + '. Let them know they need to add funds.'
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

        // Continue the loop â Claude will now process the results
        continue
      }

      // No tool use â Claude gave a final text response
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

    // 12. Discovery system
    detectDiscoveryInResponse(user.id, finalContent).catch(console.error)
    checkForDiscoveryAnswer(user.id, content).catch(console.error)

    // 13. Update thread summary
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
      generatedContent,
      generatedImage,
      openCharacterBuilder,
      contentPack,
      dailyRemaining: remaining - 1,
      dailyLimit: DAILY_MESSAGE_LIMIT,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}

// GET â retrieve chat history
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
