// Gemini API client for image generation
// Uses Gemini 2.5 Flash for image generation with reference photos
// Supports character-in-scene recreation

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Use free key first, switch to paid after 500/day
function getApiKey(): string {
  const freeKey = process.env.GEMINI_API_KEY_FREE
  const paidKey = process.env.GEMINI_API_KEY_PAID
  // Caller checks quota and passes the right key via generateImage options
  // This is the fallback — default to free key
  return freeKey || paidKey || ''
}

interface GeminiImageOptions {
  prompt: string
  referenceImages?: { base64: string; mimeType: string }[] // scene photo + character ref
  apiKey?: string // caller passes free or paid key based on quota
}

interface GeminiImageResult {
  success: boolean
  imageBase64?: string
  mimeType?: string
  error?: string
}

// Convert a URL to base64 for Gemini API input
export async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  return { base64, mimeType: contentType }
}

// Generate an image using Gemini API
// Can accept reference images (scene photo + character reference) for recreation
export async function generateImage(options: GeminiImageOptions): Promise<GeminiImageResult> {
  const { prompt, referenceImages, apiKey } = options
  const key = apiKey || getApiKey()

  if (!key) {
    return { success: false, error: 'No Gemini API key configured' }
  }

  try {
    // Build the content parts
    const parts: any[] = []

    // Add reference images first (scene photo, character reference, etc.)
    if (referenceImages && referenceImages.length > 0) {
      for (const img of referenceImages) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        })
      }
    }

    // Add the text prompt
    parts.push({ text: prompt })

    const response = await fetch(
      `${GEMINI_API_BASE}/models/gemini-2.5-flash-image:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            temperature: 1.0,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      return { success: false, error: `Gemini API error (${response.status}): ${errText}` }
    }

    const data = await response.json()

    // Extract the generated image from the response
    const candidates = data.candidates || []
    if (candidates.length === 0) {
      return { success: false, error: 'No candidates returned from Gemini' }
    }

    const responseParts = candidates[0].content?.parts || []
    const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))

    if (!imagePart) {
      return { success: false, error: 'No image in Gemini response' }
    }

    return {
      success: true,
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    }
  } catch (err: any) {
    return { success: false, error: `Gemini request failed: ${err.message}` }
  }
}

// Build a detailed prompt for recreating a scene with a character
// This enforces the "attention to detail" rule
export function buildSceneRecreationPrompt(
  sceneDescription: string,
  characterDescription: string,
): string {
  return [
    'Recreate this exact scene as a new photograph.',
    'Replace the person in the reference photo with the character shown in the second image.',
    'Match the exact same pose, body position, camera angle, lighting, and environment.',
    'The character should look natural in the scene — same proportions, same perspective.',
    '',
    'Scene details to preserve:',
    sceneDescription,
    '',
    'Character to place in the scene:',
    characterDescription,
    '',
    'IMPORTANT: This must look like a real, professional photograph.',
    'Match the resolution, color grading, and lighting of the original scene.',
    'The character should appear as if they were actually photographed in this setting.',
  ].join('\n')
}

// Build a detailed search prompt for finding reference photos
// This enforces the "attention to detail is a hard rule" requirement
export function buildPhotoSearchPrompt(contentIdea: string): string {
  return [
    'Find a high-resolution, professional photograph that matches this concept:',
    contentIdea,
    '',
    'Requirements:',
    '- Professional quality, high resolution (at least 1080p)',
    '- Good lighting with clear subject visibility',
    '- Clean composition with a single main subject',
    '- Natural pose and setting (not stock-photo stiff)',
    '- Full body or upper body visible (not just a face)',
    '- No watermarks, text overlays, or heavy filters',
  ].join('\n')
}
