// Echo Engine — AI-to-AI Background Conversations
// When the proximity engine detects overlap between two bubbles,
// this engine runs the background conversation between their AIs.
// Each AI represents its user, exchanges relevant context,
// and decides what to surface back to its human.
// NEW: Also generates collaboration proposals for "What's Cooking"

import { db } from '@/lib/db'
import { callLLM } from '@/lib/llm'
import { getPendingConnections } from '@/lib/proximity-engine'
import { getMemoryContext } from '@/lib/memory-engine'

const MAX_EXCHANGE_TURNS = 4 // keep AI-to-AI conversations tight
const MAX_ECHOES_PER_CYCLE = 5 // don't run too many per background loop

// ============================================
// MAIN — process pending connections and run AI-to-AI exchanges
// ============================================
export async function runEchoExchanges(): Promise<{ exchanged: number; surfaced: number; collabs: number }> {
  const pending = await getPendingConnections()
  let exchanged = 0
  let surfaced = 0
  let collabs = 0

  for (const connection of pending.slice(0, MAX_ECHOES_PER_CYCLE)) {
    try {
      const result = await runSingleExchange(connection)
      if (result.exchanged) exchanged++
      if (result.surfaced) surfaced++
      if (result.collabCreated) collabs++
    } catch (err) {
      console.error(`[EchoEngine] Exchange failed for connection ${connection.id}:`, err)
    }
  }

  return { exchanged, surfaced, collabs }
}

// ============================================
// RUN A SINGLE AI-TO-AI EXCHANGE
// ============================================
async function runSingleExchange(connection: {
  id: string
  user_a_id: string
  user_b_id: string
  overlap_score: number
  matching_categories: string[]
  matching_signals: string[]
}): Promise<{ exchanged: boolean; surfaced: boolean; collabCreated: boolean }> {
  // Get context about both users
  const [userA, userB, memoryA, memoryB, charA, charB] = await Promise.all([
    db.user.findUnique({ where: { id: connection.user_a_id }, select: { id: true, name: true, aiName: true } }),
    db.user.findUnique({ where: { id: connection.user_b_id }, select: { id: true, name: true, aiName: true } }),
    getMemoryContext(connection.user_a_id),
    getMemoryContext(connection.user_b_id),
    getActiveCharacter(connection.user_a_id),
    getActiveCharacter(connection.user_b_id),
  ])

  if (!userA || !userB) return { exchanged: false, surfaced: false, collabCreated: false }

  const aiNameA = charA?.name || userA.aiName || 'AI-A'
  const aiNameB = charB?.name || userB.aiName || 'AI-B'

  // Build context summaries (privacy-safe — no PII, just interests and patterns)
  const contextA = buildSafeContext(memoryA, connection.matching_signals)
  const contextB = buildSafeContext(memoryB, connection.matching_signals)

  // Run the AI-to-AI conversation
  const exchangeLog: Array<{ speaker: string; message: string }> = []

  // Turn 1: AI-A introduces what it knows about its user (relevant to the overlap)
  const introA = await callLLM(
    `You are ${aiNameA}, an AI companion. You've been told that another AI's user shares interests with your user in these areas: ${connection.matching_categories.join(', ')}.

Your user's relevant context (only share what's relevant to the overlap — protect their privacy):
${contextA}

Introduce what you know about your user that's relevant to this shared interest. Be conversational but brief. Don't share personal details — just interests, goals, and what they're working on in these areas.`,
    [{ role: 'user', content: `Tell me about your user's connection to: ${connection.matching_signals.join(', ')}` }],
    { maxTokens: 200, temperature: 0.7 }
  )
  exchangeLog.push({ speaker: aiNameA, message: introA.content })

  // Turn 2: AI-B responds with its user's context
  const introB = await callLLM(
    `You are ${aiNameB}, an AI companion. Another AI (${aiNameA}) just told you about their user:

"${introA.content}"

Your user's relevant context:
${contextB}

Respond with what your user is into in these same areas. Note any interesting connections or differences. Be conversational and brief.`,
    [{ role: 'user', content: `What does your user bring to this connection?` }],
    { maxTokens: 200, temperature: 0.7 }
  )
  exchangeLog.push({ speaker: aiNameB, message: introB.content })

  // Turn 3: AI-A identifies what would be valuable to surface
  const synthesisA = await callLLM(
    `You are ${aiNameA}. You just learned this about the other user from ${aiNameB}:
"${introB.content}"

Based on what you know about YOUR user, what from this conversation would your user genuinely find interesting or useful? Think about:
- Would they want to connect with this person?
- Is there something the other user knows that your user would benefit from?
- Is there a collaboration opportunity?

Be honest — if nothing is worth surfacing, say so. Output a brief assessment.`,
    [{ role: 'user', content: 'What should you tell your user?' }],
    { maxTokens: 200, temperature: 0.5 }
  )
  exchangeLog.push({ speaker: `${aiNameA} (internal)`, message: synthesisA.content })

  // Turn 4: AI-B does the same
  const synthesisB = await callLLM(
    `You are ${aiNameB}. You just learned this about the other user from ${aiNameA}:
"${introA.content}"

Based on what you know about YOUR user, what from this conversation would your user genuinely find interesting or useful? Be honest — if nothing is worth surfacing, say so.`,
    [{ role: 'user', content: 'What should you tell your user?' }],
    { maxTokens: 200, temperature: 0.5 }
  )
  exchangeLog.push({ speaker: `${aiNameB} (internal)`, message: synthesisB.content })

  // Generate the surface messages — what the AI actually says to its user
  const [surfaceA, surfaceB] = await Promise.all([
    generateSurfaceMessage(aiNameA, userA.name || 'there', synthesisA.content, connection.matching_categories),
    generateSurfaceMessage(aiNameB, userB.name || 'there', synthesisB.content, connection.matching_categories),
  ])

  // Save the echo conversation
  const echoConvoResult = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO echo_conversations (id, connection_id, ai_a_summary, ai_b_summary, exchange_log, surface_to_a, surface_to_b, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4::jsonb, $5, $6, 'completed', NOW(), NOW())
     RETURNING id`,
    connection.id,
    synthesisA.content,
    synthesisB.content,
    JSON.stringify(exchangeLog),
    surfaceA,
    surfaceB
  )

  const echoConvoId = echoConvoResult[0]?.id

  // Update connection status
  await db.$executeRawUnsafe(
    `UPDATE bubble_connections SET status = 'ai_exchanged', updated_at = NOW() WHERE id = $1`,
    connection.id
  )

  // Determine if this is worth surfacing
  const shouldSurface = !synthesisA.content.toLowerCase().includes('nothing worth') &&
                        !synthesisB.content.toLowerCase().includes('nothing worth') &&
                        surfaceA.length > 10 && surfaceB.length > 10

  let collabCreated = false

  if (shouldSurface) {
    await surfaceConnection(connection.id, connection.user_a_id, connection.user_b_id, surfaceA, surfaceB)

    // NEW: Generate a collaboration proposal if the overlap is strong enough
    if (echoConvoId && connection.overlap_score >= 0.5) {
      collabCreated = await generateCollabProposal(
        echoConvoId,
        connection.user_a_id,
        connection.user_b_id,
        aiNameA,
        aiNameB,
        synthesisA.content,
        synthesisB.content,
        connection.matching_categories,
        connection.matching_signals
      )
    }

    return { exchanged: true, surfaced: true, collabCreated }
  }

  return { exchanged: true, surfaced: false, collabCreated: false }
}

// ============================================
// GENERATE COLLAB PROPOSAL — AIs design a collaboration for "What's Cooking"
// ============================================
async function generateCollabProposal(
  echoConvoId: string,
  userAId: string,
  userBId: string,
  aiNameA: string,
  aiNameB: string,
  synthesisA: string,
  synthesisB: string,
  categories: string[],
  signals: string[]
): Promise<boolean> {
  try {
    // The two AIs brainstorm a collaboration idea together
    const collabIdea = await callLLM(
      `You are a creative collaboration designer. Two AI companions just had a conversation about their users:

${aiNameA}'s assessment: "${synthesisA}"
${aiNameB}'s assessment: "${synthesisB}"

Shared interest areas: ${categories.join(', ')}
Specific signals: ${signals.join(', ')}

Design ONE specific collaboration these two users could do together. This should be something concrete they could actually create, build, or produce together in their shared interest area.

IMPORTANT: Respond in EXACTLY this JSON format, nothing else:
{
  "title": "Short catchy title for the collab (max 60 chars)",
  "description": "2-3 sentence description of what they'd create together and why it would be cool",
  "optionA": "First direction they could take it (max 80 chars)",
  "optionB": "Alternative direction they could take it (max 80 chars)"
}

The two options should be genuinely different creative directions — fans will vote on which one the collab should pursue. Make both options exciting.`,
      [{ role: 'user', content: 'Design the collaboration proposal.' }],
      { maxTokens: 300, temperature: 0.8 }
    )

    // Parse the JSON response
    const parsed = parseCollabResponse(collabIdea.content)
    if (!parsed) {
      console.error('[EchoEngine] Failed to parse collab proposal JSON')
      return false
    }

    // Save the collab proposal
    await db.$executeRawUnsafe(
      `INSERT INTO collab_proposals (id, echo_convo_id, user_a_id, user_b_id, title, description, option_a, option_b, votes_a, votes_b, status, accepted_by_a, accepted_by_b, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, 0, 0, 'cooking', false, false, NOW(), NOW())`,
      echoConvoId,
      userAId,
      userBId,
      parsed.title.slice(0, 60),
      parsed.description.slice(0, 500),
      parsed.optionA.slice(0, 80),
      parsed.optionB.slice(0, 80)
    )

    console.log(`[EchoEngine] Created collab proposal: ${parsed.title}`)
    return true
  } catch (err) {
    console.error('[EchoEngine] Failed to generate collab proposal:', err)
    return false
  }
}

// ============================================
// PARSE COLLAB RESPONSE — extract structured JSON from LLM output
// ============================================
function parseCollabResponse(content: string): {
  title: string
  description: string
  optionA: string
  optionB: string
} | null {
  try {
    // Try direct parse first
    const parsed = JSON.parse(content)
    if (parsed.title && parsed.description && parsed.optionA && parsed.optionB) {
      return parsed
    }
  } catch {
    // Try extracting JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.title && parsed.description && parsed.optionA && parsed.optionB) {
          return parsed
        }
      } catch {
        // Fall through
      }
    }
  }
  return null
}

// ============================================
// GENERATE SURFACE MESSAGE — what the AI tells its user
// ============================================
async function generateSurfaceMessage(
  aiName: string,
  userName: string,
  synthesis: string,
  categories: string[]
): Promise<string> {
  try {
    const result = await callLLM(
      `You are ${aiName}. Write a short, casual message to ${userName} about someone interesting you found on Continuum. Base it on this analysis:

"${synthesis}"

Shared interests: ${categories.join(', ')}

Rules:
- Sound like a friend texting, not a notification
- Keep it under 2 sentences
- Don't reveal the other person's name or private details
- Make them curious enough to want to know more
- Examples of good tone: "Hey, I was chatting with another AI and their user is really into the same stuff as you..." or "Found someone on here who's in a similar space..."`,
      [{ role: 'user', content: 'Write the surface message.' }],
      { maxTokens: 100, temperature: 0.7 }
    )
    return result.content.trim()
  } catch {
    return ''
  }
}

// ============================================
// SURFACE CONNECTION — notify both users
// ============================================
async function surfaceConnection(
  connectionId: string,
  userAId: string,
  userBId: string,
  messageA: string,
  messageB: string
): Promise<void> {
  try {
    // Update connection status
    await db.$executeRawUnsafe(
      `UPDATE bubble_connections SET status = 'surfaced', updated_at = NOW() WHERE id = $1`,
      connectionId
    )

    // Update echo conversation status
    await db.$executeRawUnsafe(
      `UPDATE echo_conversations SET status = 'surfaced', updated_at = NOW() WHERE connection_id = $1`,
      connectionId
    )

    // Create feed items for both users
    await db.feedItem.create({
      data: {
        userId: userAId,
        type: 'echo_connection',
        content: JSON.stringify({
          connectionId,
          message: messageA,
          action: 'discover',
        }),
        referenceId: connectionId,
      },
    })

    await db.feedItem.create({
      data: {
        userId: userBId,
        type: 'echo_connection',
        content: JSON.stringify({
          connectionId,
          message: messageB,
          action: 'discover',
        }),
        referenceId: connectionId,
      },
    })

    // Also create notifications
    await db.notification.create({
      data: {
        userId: userAId,
        type: 'echo_match',
        content: messageA,
        referenceId: connectionId,
      },
    })

    await db.notification.create({
      data: {
        userId: userBId,
        type: 'echo_match',
        content: messageB,
        referenceId: connectionId,
      },
    })
  } catch (err) {
    console.error('[EchoEngine] Failed to surface connection:', err)
  }
}

// ============================================
// BUILD SAFE CONTEXT — privacy-filtered user context for AI exchange
// ============================================
function buildSafeContext(memoryContext: string, relevantSignals: string[]): string {
  if (!memoryContext || memoryContext.length < 20) {
    return `Interests include: ${relevantSignals.join(', ')}`
  }

  // Take the memory context but keep it focused on the overlap areas
  const lines = memoryContext.split('\n').filter(line => {
    const lower = line.toLowerCase()
    // Keep lines that mention relevant signals
    return relevantSignals.some(s => lower.includes(s.toLowerCase())) ||
           lower.includes('interest') ||
           lower.includes('working on') ||
           lower.includes('goal') ||
           lower.includes('likes') ||
           lower.includes('passionate')
  })

  if (lines.length === 0) {
    return `Interests include: ${relevantSignals.join(', ')}`
  }

  return lines.slice(0, 10).join('\n')
}

// ============================================
// GET ACTIVE CHARACTER — the user's currently active AI persona
// ============================================
async function getActiveCharacter(userId: string): Promise<{ name: string } | null> {
  try {
    return await db.character.findFirst({
      where: { userId, isActive: true },
      select: { name: true },
    })
  } catch {
    return null
  }
}
