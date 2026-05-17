// LLM client — wraps Anthropic Claude API
// Swap provider here if needed; rest of app doesn't care

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  tokensUsed: number
}

export async function callLLM(
  systemPrompt: string,
  messages: LLMMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.7,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const content = data.content[0]?.text || ''
  const tokensUsed =
    (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)

  return { content, tokensUsed }
}
