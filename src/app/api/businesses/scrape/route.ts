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
          // Strip HTML tags, limit to 5000 chars
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

    // Use callLLM to extract business info
    const prompt = `Analyze the following web page content and extract business information. Return a JSON object with these fields (use null for anything you can't determine):
{
  "name": "business name",
  "websiteUrl": "main website URL",
  "businessType": "type of business (e.g. Nail Tech, Restaurant, Clothing Brand)",
  "productsServices": "what they sell or offer",
  "targetAudience": "who their ideal customers are",
  "socialLinks": [{"platform": "Instagram", "url": "..."}, ...],
  "location": "city/state",
  "brandVoice": "their brand tone (e.g. casual, professional, edgy)"
}

Page content:
${pageContents.join('\n\n---\n\n')}

Return ONLY the JSON object, no other text.`

    const response = await callLLM(
      'You are a business analyst that extracts structured business information from web pages. Return only valid JSON.',
      [{ role: 'user', content: prompt }],
      { maxTokens: 1024, temperature: 0.3 }
    )

    // Try to parse JSON from response
    try {
      const extracted = JSON.parse(response.content)
      return NextResponse.json({ extracted })
    } catch {
      // If parsing fails, return raw text
      return NextResponse.json({ extracted: null, raw: response.content })
    }
  } catch (err) {
    console.error('Scrape error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
