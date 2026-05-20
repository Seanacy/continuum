import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getUserDiscoveryAnswers, saveDiscoveryAnswer } from '@/lib/discovery-engine'
import { DISCOVERY_QUESTIONS } from '@/lib/discovery-questions'

export const dynamic = 'force-dynamic'

// GET — return discovery state + answers + visible questions
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await getUserDiscoveryAnswers(user.id)

  // Only return questions for the current level
  const visibleQuestions = DISCOVERY_QUESTIONS
    .filter((q) => q.level <= data.currentLevel)
    .map((q) => ({
      id: q.id,
      level: q.level,
      question: q.question,
      answer: data.answers.find((a) => a.questionId === q.id)?.answer || null,
    }))

  return NextResponse.json({
    currentLevel: data.currentLevel,
    allLevelComplete: data.allLevelComplete,
    questions: visibleQuestions,
  })
}

// POST — save an answer from Settings
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { questionId, answer } = body

  if (!questionId || !answer || typeof answer !== 'string') {
    return NextResponse.json({ error: 'questionId and answer required' }, { status: 400 })
  }

  // Verify this question exists
  const question = DISCOVERY_QUESTIONS.find((q) => q.id === questionId)
  if (!question) {
    return NextResponse.json({ error: 'Unknown question' }, { status: 400 })
  }

  await saveDiscoveryAnswer(user.id, questionId, answer.trim(), 'settings')

  return NextResponse.json({ saved: true })
}
