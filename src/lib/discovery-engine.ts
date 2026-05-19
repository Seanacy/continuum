// Discovery Engine
// Manages when and how Emily asks discovery questions.
// Rules:
//   - No question until 3+ hours after account creation
//   - Max 1 question per day
//   - Never at the start of a conversation — slip it in naturally
//   - Level 2 unlocks only after ALL Level 1 answered
//   - Answers stored as high-weight memories too

import { db } from './db'
import { DISCOVERY_QUESTIONS, getQuestionsForLevel, type DiscoveryQuestion } from './discovery-questions'

const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface DiscoveryState {
  currentLevel: number
  answeredIds: string[]
  canAskToday: boolean
  nextQuestion: DiscoveryQuestion | null
  allLevelComplete: boolean
}

/**
 * Get the full discovery state for a user.
 * The prompt engine calls this to decide whether to inject a question.
 */
export async function getDiscoveryState(userId: string): Promise<DiscoveryState> {
  // Get user creation time
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  })

  if (!user) {
    return { currentLevel: 1, answeredIds: [], canAskToday: false, nextQuestion: null, allLevelComplete: false }
  }

  // Rule: no questions until 3 hours after signup
  const accountAge = Date.now() - user.createdAt.getTime()
  if (accountAge < THREE_HOURS_MS) {
    return { currentLevel: 1, answeredIds: [], canAskToday: false, nextQuestion: null, allLevelComplete: false }
  }

  // Get all answered questions
  const answers = await db.discoveryAnswer.findMany({
    where: { userId },
    select: { questionId: true, level: true, createdAt: true, updatedAt: true },
  })

  const answeredIds = answers.map((a) => a.questionId)

  // Determine current level
  let currentLevel = 1
  for (let level = 1; level <= 3; level++) {
    const levelQuestions = getQuestionsForLevel(level)
    if (levelQuestions.length === 0) break // no questions for this level yet
    const allAnswered = levelQuestions.every((q) => answeredIds.includes(q.id))
    if (allAnswered && level < 3) {
      currentLevel = level + 1
    } else {
      currentLevel = level
      break
    }
  }

  // Check if all questions at current level are done
  const currentLevelQuestions = getQuestionsForLevel(currentLevel)
  const allLevelComplete = currentLevelQuestions.length > 0 &&
    currentLevelQuestions.every((q) => answeredIds.includes(q.id))

  // Rule: max 1 question per day — check if we already asked/answered today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const answeredToday = answers.some((a) => {
    const answerDate = a.updatedAt || a.createdAt
    return answerDate >= todayStart
  })

  // Also check if Emily already asked a question today (stored in ai_state context)
  let askedToday = false
  try {
    const aiState = await db.aiState.findUnique({
      where: { userId },
      select: { context: true },
    })
    if (aiState?.context && typeof aiState.context === 'object') {
      const ctx = aiState.context as Record<string, unknown>
      const lastAsked = ctx.lastDiscoveryAsked as string | undefined
      if (lastAsked) {
        const lastAskedDate = new Date(lastAsked)
        askedToday = lastAskedDate >= todayStart
      }
    }
  } catch {
    // Non-critical
  }

  const canAskToday = !answeredToday && !askedToday

  // Pick next unanswered question at current level
  const unanswered = currentLevelQuestions.filter((q) => !answeredIds.includes(q.id))
  const nextQuestion = unanswered.length > 0 ? unanswered[0] : null

  return {
    currentLevel,
    answeredIds,
    canAskToday,
    nextQuestion,
    allLevelComplete,
  }
}

/**
 * Build the discovery prompt block for injection into the system prompt.
 * Returns empty string if no question should be asked.
 */
export async function getDiscoveryPromptBlock(userId: string): Promise<string> {
  try {
    const state = await getDiscoveryState(userId)

    if (!state.canAskToday || !state.nextQuestion) return ''

    const q = state.nextQuestion

    return `\n## Getting to Know Them — Discovery Question
You have ONE question to slip into today's conversation. Do NOT ask it right away. Wait until there's a natural moment — after a few exchanges, when the conversation has some flow. Then weave it in casually, like it just came to mind.

The question: "${q.question}"
What this reveals: ${q.reveals}
How to lead in: ${q.leadIn}

Rules:
1. Do NOT open with this question. Let the conversation breathe first.
2. Do NOT say "I have a question for you" or "I've been meaning to ask." Just let it come up naturally.
3. If the conversation never reaches a natural moment for it, skip it. There's always tomorrow.
4. When they answer, acknowledge it genuinely. Don't just move on. Let them know you heard them.
5. Their answer matters — it helps you understand who they really are. Treat it that way.
6. Only ask this ONE question. Don't stack multiple discovery questions.`
  } catch {
    return ''
  }
}

/**
 * Mark that Emily asked a discovery question today.
 * Call this after detecting the question was asked in the AI response.
 */
export async function markDiscoveryAsked(userId: string, questionId: string): Promise<void> {
  try {
    const aiState = await db.aiState.findUnique({
      where: { userId },
      select: { context: true },
    })

    const currentCtx =
      aiState?.context && typeof aiState.context === 'object'
        ? (aiState.context as Record<string, unknown>)
        : {}

    await db.aiState.update({
      where: { userId },
      data: {
        context: {
          ...currentCtx,
          lastDiscoveryAsked: new Date().toISOString(),
          lastDiscoveryQuestionId: questionId,
        },
      },
    })
  } catch {
    // Non-critical
  }
}

/**
 * Save a discovery answer (from chat or settings).
 * Also creates a high-weight memory entry.
 */
export async function saveDiscoveryAnswer(
  userId: string,
  questionId: string,
  answer: string,
  source: 'chat' | 'settings' = 'chat'
): Promise<void> {
  const question = DISCOVERY_QUESTIONS.find((q) => q.id === questionId)
  if (!question) return

  // Upsert the discovery answer
  await db.discoveryAnswer.upsert({
    where: {
      userId_questionId: { userId, questionId },
    },
    create: {
      userId,
      questionId,
      level: question.level,
      answer,
      source,
    },
    update: {
      answer,
      source,
    },
  })

  // Also store as a high-weight memory so Emily always has it
  await db.memory.create({
    data: {
      userId,
      type: 'discovery',
      content: `[Asked: "${question.question}"] ${answer}`,
      source: `discovery-${source}`,
      weight: 5.0, // Very high weight — this is user-stated truth
    },
  })
}

/**
 * Detect if the AI response contained a discovery question,
 * and if the next user message is an answer to it.
 * Call this from the chat route.
 */
export async function detectDiscoveryInResponse(
  userId: string,
  aiResponse: string
): Promise<string | null> {
  // Check which question Emily was supposed to ask
  try {
    const aiState = await db.aiState.findUnique({
      where: { userId },
      select: { context: true },
    })

    const ctx = aiState?.context as Record<string, unknown> | null
    const pendingQuestionId = ctx?.lastDiscoveryQuestionId as string | undefined

    if (!pendingQuestionId) {
      // Check if response contains any of the discovery questions
      const state = await getDiscoveryState(userId)
      if (!state.nextQuestion) return null

      const q = state.nextQuestion
      const lower = aiResponse.toLowerCase()
      const questionLower = q.question.toLowerCase()

      // Check if the question (or close variant) appears in the response
      // Use keyword matching since Emily rephrases
      const keywords = questionLower.split(' ').filter((w) => w.length > 4)
      const matchCount = keywords.filter((kw) => lower.includes(kw)).length
      const matchRatio = matchCount / keywords.length

      if (matchRatio > 0.5) {
        await markDiscoveryAsked(userId, q.id)
        return q.id
      }
    }

    return pendingQuestionId || null
  } catch {
    return null
  }
}

/**
 * Check if the user's message is answering a pending discovery question.
 * If so, save the answer.
 */
export async function checkForDiscoveryAnswer(
  userId: string,
  userMessage: string
): Promise<boolean> {
  try {
    const aiState = await db.aiState.findUnique({
      where: { userId },
      select: { context: true },
    })

    const ctx = aiState?.context as Record<string, unknown> | null
    const pendingQuestionId = ctx?.lastDiscoveryQuestionId as string | undefined

    if (!pendingQuestionId) return false

    // Check if this question was already answered
    const existing = await db.discoveryAnswer.findUnique({
      where: {
        userId_questionId: { userId, questionId: pendingQuestionId },
      },
    })

    if (existing) {
      // Already answered — clear pending
      const currentCtx = (aiState?.context as Record<string, unknown>) || {}
      await db.aiState.update({
        where: { userId },
        data: {
          context: {
            ...currentCtx,
            lastDiscoveryQuestionId: null,
          },
        },
      })
      return false
    }

    // Save the answer — the user's response to the pending question
    // Only save if the message has some substance (more than a few words)
    if (userMessage.trim().split(' ').length >= 3) {
      await saveDiscoveryAnswer(userId, pendingQuestionId, userMessage, 'chat')

      // Clear the pending question
      const currentCtx = (aiState?.context as Record<string, unknown>) || {}
      await db.aiState.update({
        where: { userId },
        data: {
          context: {
            ...currentCtx,
            lastDiscoveryQuestionId: null,
          },
        },
      })

      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Get all answers for a user, organized by level.
 * Used by the Settings UI.
 */
export async function getUserDiscoveryAnswers(userId: string) {
  const answers = await db.discoveryAnswer.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })

  const state = await getDiscoveryState(userId)

  return {
    currentLevel: state.currentLevel,
    allLevelComplete: state.allLevelComplete,
    answers: answers.map((a) => ({
      questionId: a.questionId,
      level: a.level,
      answer: a.answer,
      source: a.source,
      updatedAt: a.updatedAt,
    })),
  }
}
