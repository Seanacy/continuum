import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { callLLM } from '@/lib/llm'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { links } = await req.json()
    if (!links || typeof links !== 'string') {
      return NextResponse.json({ error: 'links field required' }, { status: 400 })
    }

    // Extract URLs from raw text
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^\x60]+/gi
    const urls = links.match(urlRegex) || []
    if (urls.length === 0) {
      return NextResponse.json({ error: 'No valid URLs found' }, { status: 400 })
    }

    // Fetch each URL (max 5, 10s timeout each)
    const pageContents: string[] = []
    for (const url of urls.slice(0, 5)) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContinuumBot/1.0)' },
        })
        clearTimeout(timeout)
        if (res.ok) {
          const html = await res.text()
          const stripped = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000)
          pageContents.push(`URL: ${url}\nContent: ${stripped}`)
        }
      } catch {
        // Skip failed fetches
      }
    }

    if (pageContents.length === 0) {
      return NextResponse.json({ error: 'Could not fetch any of the provided URLs' }, { status: 400 })
    }

    // Use callLLM to extract BOTH business and personal info — auto-sort
    const prompt = `Analyze the following web page content. Extract ALL information you can find and sort it into two categories: BUSINESS info and PERSONAL info.

Some info might fit both — that's fine, put it where it makes the most sense. For example:
- Job title → business
- Hobbies mentioned in a bio → personal
- Company name → business
- Education → personal
- "Fitness coach who loves hiking" → fitness coach = business, hiking = personal

Return a JSON object with this exact structure:
{
  "business": {
    "name": "business/company name or null",
    "businessType": "type of business or null",
    "productsServices": "what they sell/offer or null",
    "targetAudience": "who their customers are or null",
    "brandVoice": "their communication tone or null",
    "location": "business location or null",
    "websiteUrl": "main website URL or null",
    "socialLinks": [{"platform": "Instagram", "url": "..."}]
  },
  "personal": {
    "name": "person's full name or null",
    "location": "where they live or null",
    "interests": ["hobby1", "hobby2"],
    "background": "education, career history, bio summary or null",
    "personality": "communication style, values, what drives them or null",
    "funFacts": ["any interesting personal details"]
  }
}

Page content:
${pageContents.join('\n\n---\n\n')}

Return ONLY the JSON object, no other text.`

    const response = await callLLM(
      'You are an expert at extracting and categorizing information about people and businesses from web pages. Auto-sort everything into business vs personal buckets. Return only valid JSON.',
      [{ role: 'user', content: prompt }],
      { maxTokens: 1500, temperature: 0.3 }
    )

    try {
      const extracted = JSON.parse(response.content)
      return NextResponse.json({ extracted })
    } catch {
      return NextResponse.json({ extracted: null, raw: response.content })
    }
  } catch (err) {
    console.error('Onboarding scrape error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
