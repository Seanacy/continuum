// Image Generation Engine
// Uses fal.ai Flux 1.1 Pro for image generation
// Pay-as-you-go: 2 credits (10¢) per image

import { chargeAmount } from './credit-system'

// ============================================
// CONSTANTS
// ============================================
export const IMAGE_PRICE_CENTS = 10 // 10¢ per image (2 credits at 5¢/credit)
export const IMAGE_COST_CENTS = 3   // ~3¢ cost to us (Flux Pro on fal.ai)

// ============================================
// TYPES
// ============================================
export interface ImageGenerationResult {
  success: boolean
  imageUrl?: string
  error?: string
  prompt?: string
  width?: number
  height?: number
}

// ============================================
// GENERATE IMAGE
// ============================================
export async function generateImage(
  userId: string,
  prompt: string,
  options?: {
    imageSize?: string // 'square_hd' | 'landscape_4_3' | 'portrait_4_3' etc.
  }
): Promise<ImageGenerationResult> {
  const apiKey = process.env.FAL_API_KEY
  if (!apiKey) {
    return { success: false, error: 'Image generation not configured' }
  }

  // Charge wallet first
  const charge = await chargeAmount(
    userId,
    IMAGE_PRICE_CENTS,
    'Image generation',
    { prompt: prompt.substring(0, 100) }
  )

  if (!charge.allowed) {
    return {
      success: false,
      error: `Not enough credits. You need $0.10 but only have $${(charge.remaining / 100).toFixed(2)}. Add funds to generate images.`,
    }
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: options?.imageSize || 'landscape_4_3',
        num_images: 1,
        output_format: 'jpeg',
        sync_mode: true,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('fal.ai error:', res.status, errText)
      // Refund on failure
      const { refund } = await import('./credit-system')
      await refund(userId, IMAGE_PRICE_CENTS, 'Image generation failed')
      return { success: false, error: 'Image generation failed. Your credits have been refunded.' }
    }

    const data = await res.json()
    const image = data.images?.[0]

    if (!image?.url) {
      const { refund } = await import('./credit-system')
      await refund(userId, IMAGE_PRICE_CENTS, 'No image returned')
      return { success: false, error: 'No image was generated. Your credits have been refunded.' }
    }

    return {
      success: true,
      imageUrl: image.url,
      prompt,
      width: image.width,
      height: image.height,
    }
  } catch (error) {
    console.error('Image generation error:', error)
    // Refund on error
    try {
      const { refund } = await import('./credit-system')
      await refund(userId, IMAGE_PRICE_CENTS, 'Image generation error')
    } catch (refundErr) {
      console.error('Refund failed:', refundErr)
    }
    return { success: false, error: 'Something went wrong generating your image. Credits refunded.' }
  }
}
