// Scene Recreator
// Takes an approved scene photo + character reference image
// Sends both to Gemini API to recreate the scene with the AI character
// Handles quota tracking and Supabase storage upload

import { generateImage, urlToBase64, buildSceneRecreationPrompt } from '@/lib/gemini'
import { getImageTier, recordImageGeneration, recordFailedGeneration } from '@/lib/image-quota'
import { db } from '@/lib/db'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Input for scene recreation
export interface SceneRecreationInput {
  userId: string
  characterId: string
  scenePhotoUrl: string       // the approved real photo
  characterReferenceUrl: string // the AI character's reference image
  sceneDescription: string    // detailed description of the scene
  characterDescription: string // what the character looks like
  contentIdeaId?: string      // which content idea this belongs to
}

// Result of scene recreation
export interface SceneRecreationResult {
  success: boolean
  imageUrl?: string           // final uploaded image URL
  tier: 'free' | 'paid'      // which API tier was used
  costCents: number           // 0 for free, ~4 for paid
  error?: string
  generationId?: string       // ID in image_generations table
}

// Main function: recreate a scene with the AI character
export async function recreateScene(
  input: SceneRecreationInput
): Promise<SceneRecreationResult> {
  // Step 1: Check quota and get the right API key
  const tierInfo = await getImageTier()
  
  if (!tierInfo.apiKey) {
    return {
      success: false,
      tier: tierInfo.tier,
      costCents: 0,
      error: 'No Gemini API key configured. Set GEMINI_API_KEY_FREE or GEMINI_API_KEY_PAID in environment variables.',
    }
  }

  // Step 2: Download both images and convert to base64
  let sceneBase64: { base64: string; mimeType: string }
  let characterBase64: { base64: string; mimeType: string }

  try {
    [sceneBase64, characterBase64] = await Promise.all([
      urlToBase64(input.scenePhotoUrl),
      urlToBase64(input.characterReferenceUrl),
    ])
  } catch (error) {
    const errMsg = 'Failed to download reference images: ' + (error instanceof Error ? error.message : String(error))
    await recordFailedGeneration({
      userId: input.userId,
      characterId: input.characterId,
      promptUsed: input.sceneDescription,
      tier: tierInfo.tier,
      error: errMsg,
    })
    return {
      success: false,
      tier: tierInfo.tier,
      costCents: 0,
      error: errMsg,
    }
  }

  // Step 3: Build the prompt
  const prompt = buildSceneRecreationPrompt(
    input.sceneDescription,
    input.characterDescription
  )

  // Step 4: Call Gemini API with both images
  try {
    const result = await generateImage({
      prompt,
      referenceImages: [
        sceneBase64,       // scene photo first
        characterBase64,   // character reference second
      ],
      apiKey: tierInfo.apiKey,
    })

    if (!result.success || !result.imageBase64) {
      const errMsg = result.error || 'Gemini returned no image'
      await recordFailedGeneration({
        userId: input.userId,
        characterId: input.characterId,
        promptUsed: prompt,
        tier: tierInfo.tier,
        error: errMsg,
      })
      return {
        success: false,
        tier: tierInfo.tier,
        costCents: 0,
        error: errMsg,
      }
    }

    // Step 5: Upload result to Supabase Storage
    const fileName = 'scene-' + input.characterId + '-' + Date.now() + '.png'
    const filePath = input.userId + '/scenes/' + fileName
    const imageBuffer = Buffer.from(result.imageBase64, 'base64')

    const { error: uploadError } = await supabase.storage
      .from('character-images')
      .upload(filePath, imageBuffer, {
        contentType: result.mimeType || 'image/png',
        upsert: false,
      })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      // Still record the generation even if upload fails
      await recordImageGeneration({
        userId: input.userId,
        characterId: input.characterId,
        promptUsed: prompt,
        referenceUrl: input.scenePhotoUrl,
        resultUrl: undefined,
        tier: tierInfo.tier,
        metadata: {
          contentIdeaId: input.contentIdeaId,
          uploadError: uploadError.message,
        },
      })
      return {
        success: false,
        tier: tierInfo.tier,
        costCents: tierInfo.tier === 'paid' ? 4 : 0,
        error: 'Image generated but upload failed: ' + uploadError.message,
      }
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('character-images')
      .getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    // Step 6: Record the successful generation
    const generation = await db.imageGeneration.create({
      data: {
        userId: input.userId,
        characterId: input.characterId,
        promptUsed: prompt,
        referenceUrl: input.scenePhotoUrl,
        resultUrl: publicUrl,
        tier: tierInfo.tier,
        costCents: tierInfo.tier === 'paid' ? 4 : 0,
        status: 'completed',
        metadata: {
          contentIdeaId: input.contentIdeaId,
          sceneDescription: input.sceneDescription,
        },
      },
    })

    // Update the daily quota counter
    await recordImageGeneration({
      userId: input.userId,
      characterId: input.characterId,
      promptUsed: prompt,
      referenceUrl: input.scenePhotoUrl,
      resultUrl: publicUrl,
      tier: tierInfo.tier,
      metadata: { contentIdeaId: input.contentIdeaId },
    })

    return {
      success: true,
      imageUrl: publicUrl,
      tier: tierInfo.tier,
      costCents: tierInfo.tier === 'paid' ? 4 : 0,
      generationId: generation.id,
    }
  } catch (error) {
    const errMsg = 'Gemini API call failed: ' + (error instanceof Error ? error.message : String(error))
    await recordFailedGeneration({
      userId: input.userId,
      characterId: input.characterId,
      promptUsed: prompt,
      tier: tierInfo.tier,
      error: errMsg,
    })
    return {
      success: false,
      tier: tierInfo.tier,
      costCents: 0,
      error: errMsg,
    }
  }
}

// Get a character's reference image URL (first profile pic)
export async function getCharacterReferenceImage(
  characterId: string
): Promise<string | null> {
  // Try CharacterImage table first (higher quality)
  const charImage = await db.characterImage.findFirst({
    where: {
      characterId,
      imageType: 'profile',
    },
    orderBy: { createdAt: 'desc' },
  })

  if (charImage) return charImage.imageUrl

  // Fall back to character's imageUrls JSON array
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { imageUrls: true },
  })

  const urls = (character?.imageUrls as string[]) || []
  return urls[0] || null
}

// Build character description from their profile
export async function buildCharacterDescription(
  characterId: string
): Promise<string> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: {
      name: true,
      personality: true,
      backstory: true,
    },
  })

  if (!character) return 'A person'

  const personality = (character.personality as Record<string, any>) || {}
  let desc = character.name

  if (personality.physicalDescription) {
    desc += '. ' + personality.physicalDescription
  }
  if (personality.style) {
    desc += '. Style: ' + personality.style
  }
  if (personality.age) {
    desc += '. Age: ' + personality.age
  }

  return desc
}
