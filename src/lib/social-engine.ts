// Social Engine
// Discovers content from across the internet based on user interests
// Emily curates the best picks and adds her own commentary
// Sources: Twitter/X, Reddit, YouTube, news, blogs — anything Tavily can find

import { db } from './db'
import { callLLM } from './llm'
import { getMemoryContext } from './memory-engine'
import { searchWeb } from './tavily'

const MAX_PICKS_PER_CYCLE = 3
const SOCIAL_COOLDOWN_HOURS = 8 // don't generate social picks too often

interface SocialPick {
  title: string
  url: string
  source: string // e.g. "reddit", "twitter", "youtube", "news"
  snippet: string
  commentary: string // Emily's take
}

// ============================================
// MAIN — discover and curate social content for a user
// ============================================
export async function discoverSocialContent(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return 0

  // Check cooldown — don't spam social picks
  const recentPicks = await db.feedItem.findMany({
    where: {
      userId,
      type: 'social_pick',
      createdAt: { gt: new Date(Date.now() - SOCIAL_COOLDOWN_HOURS * 60 * 60 * 1000) },
    },
  })
  if (recentPicks.length >= MAX_PICKS_PER_CYCLE) return 0

  // Get what Emily knows about this person
  const memoryContext = await getMemoryContext(userId)
  if (!memoryContext || memoryContext.length < 30) return 0 // not enough to know their interests

  // Step 1: Have Emily figure out what topics to search for
  const topics = await extractTopics(memoryContext, user.aiName || 'Emily')
  if (topics.length === 0) return 0

  // Step 2: Search for content on those topics
  const allResults: Array<{ title: string; url: string; content: string; query: string }> = []
  for (const topic of topics.slice(0, 3)) {
    try {
      const results = await searchWeb(topic, 5)
      for (const r of results.results) {
        allResults.push({ ...r, query: topic })
      }
    } catch (err) {
      console.error(`[Social] Search failed for "${topic}":`, err)
    }
  }

  if (allResults.length === 0) return 0

  // Step 3: Have Emily curate the best picks
  const picks = await curateContent(
    allResults,
    memoryContext,
    user.aiName || 'Emily',
    MAX_PICKS_PER_CYCLE - recentPicks.length
  )

  // Step 4: Save to feed
  let saved = 0
  for (const pick of picks) {
    // Avoid duplicate URLs
    const existing = await db.feedItem.findFirst({
      where: {
        userId,
        type: 'social_pick',
        referenceId: pick.url,
      },
    })
    if (existing) continue

    await db.feedItem.create({
      data: {
        userId,
        type: 'social_pick',
        content: JSON.stringify(pick),
        referenceId: pick.url, // use URL as reference to avoid duplicates
      },
    })
    saved++
  }

  return saved
}

// ============================================
// EXTRACT TOPICS — Emily decides what to search for based on memories
// ============================================
async function extractTopics(memoryContext: string, aiName: string): Promise<string[]> {
  try {
    const result = await callLLM(
      `You are ${aiName}. Based on what you know about this person, generate 2-3 specific search queries to find internet content they'd genuinely find interesting. These should search for recent discussions, news, or content from social media, Reddit, YouTube, blogs, etc.

Rules:
- Be SPECIFIC — not "technology" but "latest AI coding tools 2026"
- Reference their actual interests, projects, goals from memory
- Mix it up — don't just repeat the same topic
- Think about what a good friend would send them
- Focus on things that are CURRENT and TRENDING

Memory context:
${memoryContext}

Output ONLY a JSON array of search query strings, nothing else. Example: ["query 1", "query 2", "query 3"]`,
      [{ role: 'user', content: 'What should I search for today?' }],
      { maxTokens: 200, temperature: 0.7 }
    )

    const parsed = JSON.parse(result.content.trim())
    if (Array.isArray(parsed)) return parsed.slice(0, 3)
    return []
  } catch {
    return []
  }
}

// ============================================
// CURATE — Emily picks the best content and adds commentary
// ============================================
async function curateContent(
  results: Array<{ title: string; url: string; content: string; query: string }>,
  memoryContext: string,
  aiName: string,
  maxPicks: number
): Promise<SocialPick[]> {
  // Format results for Claude to review
  const formatted = results
    .map((r, i) => `[${i}] "${r.title}"\nURL: ${r.url}\nSnippet: ${r.content}\n`)
    .join('\n')

  try {
    const result = await callLLM(
      `You are ${aiName}. You found these items from the internet. Pick the ${maxPicks} BEST ones that this specific person would care about based on what you know about them. For each pick, write a short 1-sentence commentary — why you think they'd find it interesting. Write it like you're texting a friend ("You'd love this..." or "This reminded me of..." or "Saw this and thought of your project...").

Rules:
- Only pick items that are ACTUALLY relevant to this person
- Skip generic/clickbait/low-quality content
- Your commentary should feel personal, not like a news summary
- Detect the source platform from the URL (reddit.com = reddit, x.com/twitter.com = twitter, youtube.com = youtube, otherwise = news/blog)
- If nothing is good enough, return an empty array

Memory context:
${memoryContext}

Search results:
${formatted}

Output ONLY valid JSON array: [{"index": 0, "commentary": "...", "source": "reddit|twitter|youtube|news"}]`,
      [{ role: 'user', content: `Pick the best ${maxPicks} items.` }],
      { maxTokens: 400, temperature: 0.6 }
    )

    const picks = JSON.parse(result.content.trim())
    if (!Array.isArray(picks)) return []

    return picks
      .filter((p: { index: number }) => p.index >= 0 && p.index < results.length)
      .slice(0, maxPicks)
      .map((p: { index: number; commentary: string; source: string }) => {
        const item = results[p.index]
        return {
          title: item.title,
          url: item.url,
          source: p.source || detectSource(item.url),
          snippet: item.content.slice(0, 200),
          commentary: p.commentary,
        }
      })
  } catch {
    return []
  }
}

// ============================================
// HELPER — detect platform from URL
// ============================================
function detectSource(url: string): string {
  if (url.includes('reddit.com')) return 'reddit'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('github.com')) return 'github'
  return 'news'
}

// ============================================
// GET RECENT PICKS — for injecting into chat system prompt
// ============================================
export async function getRecentSocialPicks(userId: string, limit = 3): Promise<SocialPick[]> {
  const picks = await db.feedItem.findMany({
    where: {
      userId,
      type: 'social_pick',
      createdAt: { gt: new Date(Date.now() - 48 * 60 * 60 * 1000) }, // last 48h
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return picks
    .map((p) => {
      try {
        return JSON.parse(p.content) as SocialPick
      } catch {
        return null
      }
    })
    .filter((p): p is SocialPick => p !== null)
}
