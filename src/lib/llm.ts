// LLM client — wraps Anthropic Claude API
// Supports text, vision (image), and tool use (web search)

import { CONFIG } from './constants'

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

// Tool definitions for Claude
export interface LLMTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// A tool use request from Claude
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

// A tool result we send back to Claude
export interface ToolResultMessage {
  role: 'user'
  content: ToolResultBlock[]
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

export interface LLMResponse {
  content: string
  tokensUsed: number
  toolUse?: ToolUseBlock // present if Claude wants to use a tool
  stopReason?: string
}

export async function callLLM(
  systemPrompt: string,
  messages: (LLMMessage | ToolResultMessage)[],
  options?: { maxTokens?: number; temperature?: number; tools?: LLMTool[] }
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  // Format messages for the API
  const formattedMessages = messages.map((m) => {
    // Tool result messages pass through as-is
    if ('content' in m && Array.isArray(m.content) && m.content.length > 0 && 'tool_use_id' in (m.content[0] as unknown as Record<string, unknown>)) {
      return m
    }

    const msg = m as LLMMessage
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }
    // Multi-modal content (text + images)
    return {
      role: msg.role,
      content: (msg.content as LLMContentBlock[]).map((block) => {
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

  const body: Record<string, unknown> = {
    model: CONFIG.MODEL,
    max_tokens: options?.maxTokens || 1024,
    temperature: options?.temperature ?? 0.7,
    system: systemPrompt,
    messages: formattedMessages,
  }

  // Add tools if provided
  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const tokensUsed =
    (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)

  // Check if Claude wants to use a tool
  const toolUseBlock = data.content.find(
    (block: { type: string }) => block.type === 'tool_use'
  )

  if (toolUseBlock) {
    // Claude might also include text before the tool call
    const textBlock = data.content.find(
      (block: { type: string }) => block.type === 'text'
    )
    return {
      content: textBlock?.text || '',
      tokensUsed,
      toolUse: {
        type: 'tool_use',
        id: toolUseBlock.id,
        name: toolUseBlock.name,
        input: toolUseBlock.input,
      },
      stopReason: data.stop_reason,
    }
  }

  const content = data.content[0]?.text || ''
  return { content, tokensUsed, stopReason: data.stop_reason }
}

// The web search tool definition Emily can use
export const WEB_SEARCH_TOOL: LLMTool = {
  name: 'web_search',
  description:
    'Search the internet for current information. Use this when the user asks about recent events, news, live data, prices, scores, weather, or anything you don\'t have up-to-date knowledge about. Also use it when the user explicitly asks you to look something up or search for something.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query — be specific and include relevant keywords',
      },
    },
    required: ['query'],
  },
}

// Image search tool — Emily can find pictures from the internet
export const IMAGE_SEARCH_TOOL: LLMTool = {
  name: 'image_search',
  description:
    'Search the internet for images and pictures. Use this when the user asks you to find, show, or look up a picture or image of something. For example: "show me a picture of...", "find an image of...", "what does a ... look like?"',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for — be descriptive (e.g. "golden retriever puppy playing in snow")',
      },
    },
    required: ['query'],
  },
}

// Reminder tool — Emily can set reminders for the user
export const SET_REMINDER_TOOL: LLMTool = {
  name: 'set_reminder',
  description:
    'Set a reminder for the user. Use this when the user asks you to remind them about something, or when you notice something time-sensitive in conversation that they might want to be reminded about. Examples: "remind me to call mom tomorrow", "don\'t let me forget about the meeting at 3", "remind me in an hour to check the oven".',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'What to remind them about — write it as a natural reminder message from you, not a robotic alert. Example: "That call with mom you wanted to make" not "REMINDER: Call mom"',
      },
      due_in_minutes: {
        type: 'number',
        description: 'How many minutes from now the reminder should fire. Examples: 60 = 1 hour, 1440 = 1 day, 10080 = 1 week. For specific times, calculate the minutes from now.',
      },
    },
    required: ['content', 'due_in_minutes'],
  },
}

// Content generation tool — AI creates social posts, blog articles, etc.
export const GENERATE_CONTENT_TOOL: LLMTool = {
  name: 'generate_content',
  description:
    'Generate content for the user. Use this when the user asks you to create, write, or generate any kind of content — social media posts, blog posts, articles, captions, tweets, LinkedIn posts, newsletters, etc. Always use this tool when the user wants content they can copy and use. The content you generate should match your personality and the user\'s brand/niche.',
  input_schema: {
    type: 'object',
    properties: {
      content_type: {
        type: 'string',
        enum: ['social_post', 'blog_post', 'tweet', 'linkedin_post', 'instagram_caption', 'newsletter', 'article'],
        description: 'The type of content to generate',
      },
      platform: {
        type: 'string',
        description: 'Target platform (e.g. Instagram, Twitter/X, LinkedIn, TikTok, blog)',
      },
      topic: {
        type: 'string',
        description: 'What the content is about',
      },
      tone: {
        type: 'string',
        description: 'The tone/style (e.g. professional, casual, funny, inspirational)',
      },
      generated_content: {
        type: 'string',
        description: 'The actual generated content text. Write the FULL content here — this is what the user will see and copy.',
      },
      hashtags: {
        type: 'string',
        description: 'Relevant hashtags (for social posts). Comma-separated.',
      },
    },
    required: ['content_type', 'topic', 'generated_content'],
  },
}

// Open character builder — signals the UI to navigate to the character builder
export const OPEN_CHARACTER_BUILDER_TOOL: LLMTool = {
  name: 'open_character_builder',
  description:
    'Open the AI character builder so the user can create a new AI persona. Use this when the user says they want to create a new AI, make a new character, build a new persona, or anything about creating/adding a new AI personality.',
  input_schema: {
    type: 'object',
    properties: {
      suggestion: {
        type: 'string',
        description: 'A brief suggestion or encouragement for the user about creating their new AI character',
      },
    },
    required: ['suggestion'],
  },
}
