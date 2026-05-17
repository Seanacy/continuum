// LLM client — wraps Anthropic Claude API
// Supports text and vision (image) messages

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string | LLMContentBlock[]
}

export interface LLMContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
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

  // Format messages for the API
  const formattedMessages = messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    }
    // Multi-modal content (text + images)
    return {
      role: m.role,
      content: m.content.map((block) => {
        if (block.type === 'image' && block.source) {
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: block.source.media_type,
              data: block.source.data,
            },
          }
        }
        return { type: 'text' as const, text: block.text || '' }
      }),
    }
  })

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
      messages: formattedMessages,
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
