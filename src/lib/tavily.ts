// Tavily — web search for Emily
// Called when Claude decides it needs live info from the internet

export interface TavilyResult {
  title: string
  url: string
  content: string // snippet
}

export interface TavilyResponse {
  results: TavilyResult[]
  query: string
}

export async function searchWeb(query: string, maxResults = 5): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY not set')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tavily API error ${res.status}: ${err}`)
  }

  const data = await res.json()

  return {
    query,
    results: (data.results || []).map((r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })),
  }
}
