import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

// POST /api/businesses/scrape — AI scrapes links to extract business info
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { links } = body; // string — raw text with URLs pasted by user

    if (!links || !links.trim()) {
      return NextResponse.json({ error: 'Please provide at least one link' }, { status: 400 });
    }

    // Extract URLs from the raw text
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = links.match(urlRegex) || [];

    if (urls.length === 0) {
      return NextResponse.json({ error: 'No valid URLs found in the text' }, { status: 400 });
    }

    // Fetch page content for each URL (basic text extraction)
    const pageContents: string[] = [];
    for (const url of urls.slice(0, 5)) { // max 5 URLs
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContinuumBot/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const html = await res.text();
          // Strip HTML tags, get text content (basic approach)
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 5000); // limit per page
          pageContents.push(`--- Content from ${url} ---\n${text}`);
        }
      } catch {
        pageContents.push(`--- Could not fetch ${url} ---`);
      }
    }

    // Use Claude to extract structured business info
    const prompt = `You are analyzing web pages to extract business information. Here are the contents scraped from the user's links:

${pageContents.join('\n\n')}

Based on all the information above, extract and return a JSON object with these fields:
- name: Business name
- websiteUrl: Main website URL
- businessType: What type of business (e.g. "Nail Tech", "Restaurant", "SaaS")
- productsServices: What products or services they offer (detailed paragraph)
- targetAudience: Who their target market is (detailed paragraph)  
- socialLinks: Array of {platform, url} objects for any social media found
- location: City/region if mentioned
- brandVoice: The tone and voice of their brand based on their content (e.g. "Professional and authoritative", "Casual and fun")

Return ONLY valid JSON, no markdown, no explanation.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse the AI response
    const aiText = message.content[0].type === 'text' ? message.content[0].text : '';
    let extracted: any = {};
    try {
      // Try to parse JSON from the response (handle markdown code blocks)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parsing fails, return raw text
      return NextResponse.json({ 
        extracted: { name: '', websiteUrl: urls[0] || '' },
        raw: aiText,
        error: 'Could not parse AI response as JSON'
      });
    }

    return NextResponse.json({ extracted, urls });
  } catch (err) {
    console.error('POST /api/businesses/scrape error:', err);
    return NextResponse.json({ error: 'Failed to scrape links' }, { status: 500 });
  }
}
