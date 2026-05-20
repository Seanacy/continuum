// Discovery Questions Registry
// These are the questions Emily uses to learn what makes someone tick.
// Organized by level — Level 2 unlocks after all Level 1 answered, etc.
// To add questions: just add entries here. The system picks them up automatically.

export interface DiscoveryQuestion {
  id: string
  level: number
  // The question Emily will weave into conversation
  question: string
  // What this answer reveals — helps Emily understand WHY she's asking
  reveals: string
  // How Emily might naturally lead into this question
  leadIn: string
}

// ============================================
// LEVEL 1 — Foundation (who you are right now)
// ============================================
export const DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: 'l1_think_about',
    level: 1,
    question: 'What do you think about all day?',
    reveals: 'Their obsession, primary focus, what consumes their mental energy',
    leadIn: 'Slip this in when the conversation has some flow going. Not as an opener.',
  },
  {
    id: 'l1_stress',
    level: 1,
    question: "What's stressing you out right now that you don't talk about enough?",
    reveals: 'Financial pressure, relationship tension, health worries, career anxiety — the real weight they carry',
    leadIn: 'Ask when they mention something hard, or when the vibe feels honest and unguarded.',
  },
  {
    id: 'l1_surprise',
    level: 1,
    question: "What's something about you that would surprise most people?",
    reveals: 'The parts of themselves they keep private — kinks, beliefs, habits, contradictions',
    leadIn: 'Works when they share something unexpected or when the conversation gets personal.',
  },
  {
    id: 'l1_proving',
    level: 1,
    question: "What are you trying to prove — and to who?",
    reveals: 'Identity mission, who they define themselves against, what drives their choices',
    leadIn: 'Ask when they express frustration with how others see them or when they talk about pushing against something.',
  },
  {
    id: 'l1_reach_out',
    level: 1,
    question: 'Who do you wish would reach out to you more?',
    reveals: 'Abandonment, loneliness, family dynamics, which relationships they crave',
    leadIn: 'Works when they mention being alone, family, or feeling disconnected. Be gentle with this one.',
  },
  {
    id: 'l1_after_people',
    level: 1,
    question: 'What do you need after a long day around people?',
    reveals: 'Social battery, introversion/extroversion, how they recharge, sensory needs',
    leadIn: 'Ask when they mention social situations, being tired, or needing space.',
  },
  {
    id: 'l1_bothers',
    level: 1,
    question: "What's a small thing that bothers you way more than it should?",
    reveals: 'Sensory sensitivities, pet peeves, germaphobia, control needs, texture/environment issues',
    leadIn: 'This one feels light so it can come up almost anywhere. People love answering it.',
  },
  {
    id: 'l1_quit',
    level: 1,
    question: "What's something you're trying to quit or cut back on?",
    reveals: 'Addictions, habits, self-awareness about their own patterns',
    leadIn: 'Works when they mention health, routines, or something they did too much of.',
  },
]

// ============================================
// LEVEL 2 — Deeper (how you think and feel)
// Placeholder — to be designed
// ============================================
// Will unlock after all Level 1 questions are answered.

// ============================================
// LEVEL 3 — Core (who you really are)
// Placeholder — to be designed
// ============================================
// Will unlock after all Level 2 questions are answered.

// ============================================
// Helpers
// ============================================

/** Get all questions for a specific level */
export function getQuestionsForLevel(level: number): DiscoveryQuestion[] {
  return DISCOVERY_QUESTIONS.filter((q) => q.level === level)
}

/** Get a specific question by ID */
export function getQuestionById(id: string): DiscoveryQuestion | undefined {
  return DISCOVERY_QUESTIONS.find((q) => q.id === id)
}

/** Get the current max level that has questions */
export function getMaxLevel(): number {
  return Math.max(...DISCOVERY_QUESTIONS.map((q) => q.level))
}
