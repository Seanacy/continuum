// ============================================
// VISUAL PROMPT GENERATOR
// Produces 8 outputs:
//   - 2 Google Image search queries (face ref, body ref)
//   - 6 Gemini generation prompts (head front/left/right, body front/left/right)
// ============================================

import type { VisualTraits } from './visual-traits'

export interface GeneratedPrompts {
  // Google Image search queries
  googleFaceQuery: string
  googleBodyQuery: string
  // Gemini image generation prompts (sequential — each builds on previous)
  geminiHeadFront: string
  geminiHeadLeft: string
  geminiHeadRight: string
  geminiBodyFront: string
  geminiBodyLeft: string
  geminiBodyRight: string
}

// Build a natural-language description from traits
function buildFaceDescription(traits: VisualTraits): string {
  const parts: string[] = []
  if (traits.skinComplexion) parts.push(`${traits.skinComplexion} skin`)
  if (traits.hairColor && traits.hairStyle) {
    parts.push(`${traits.hairColor} ${traits.hairStyle.toLowerCase()} hair`)
  } else if (traits.hairColor) {
    parts.push(`${traits.hairColor} hair`)
  } else if (traits.hairStyle) {
    parts.push(`${traits.hairStyle.toLowerCase()} hair`)
  }
  if (traits.eyeColor) parts.push(`${traits.eyeColor.toLowerCase()} eyes`)
  if (traits.noseType) parts.push(`${traits.noseType.toLowerCase()} nose`)
  if (traits.lipType) parts.push(`${traits.lipType.toLowerCase()} lips`)
  return parts.join(', ') || 'a person'
}

function buildBodyDescription(traits: VisualTraits): string {
  const parts: string[] = []
  if (traits.height) parts.push(traits.height)
  if (traits.bodyType) parts.push(`${traits.bodyType.toLowerCase()} build`)
  if (traits.clothingStyle) parts.push(`wearing ${traits.clothingStyle.toLowerCase()} clothing`)
  return parts.join(', ') || 'average build'
}

export function generatePrompts(
  traits: VisualTraits,
  characterName: string,
  nicheType?: string
): GeneratedPrompts {
  const faceDesc = buildFaceDescription(traits)
  const bodyDesc = buildBodyDescription(traits)
  const name = characterName || 'the character'
  const niche = nicheType ? ` who is a ${nicheType} influencer` : ''
  const userDesc = traits.description ? `\n\nAdditional description from the creator: "${traits.description}"` : ''

  // ---- GOOGLE IMAGE SEARCH QUERIES ----
  // These are what the AI agent will type into Google Images to find reference photos
  const googleFaceQuery = [
    'portrait headshot',
    traits.skinComplexion || '',
    traits.hairColor || '',
    traits.hairStyle || '',
    traits.eyeColor ? `${traits.eyeColor} eyes` : '',
    'person',
    'looking at camera',
  ].filter(Boolean).join(' ')

  const googleBodyQuery = [
    'full body photo',
    traits.skinComplexion || '',
    traits.bodyType || '',
    traits.height || '',
    traits.clothingStyle || '',
    'person standing',
  ].filter(Boolean).join(' ')

  // ---- GEMINI PROMPTS ----
  // Step 1: Head Front — THE BLEND (uses reference photos)
  const geminiHeadFront = `I'm uploading reference photos. Blend their features into ONE new, original person that doesn't look exactly like any of them.

This character is named ${name}${niche}. They have: ${faceDesc}.${userDesc}

Rules:
- Create ONE front-facing headshot of a brand new person
- Match these features exactly: ${faceDesc}
- Neutral expression, looking directly at camera
- Natural facial asymmetry, subtle skin texture, realistic pores
- NO plastic or airbrushed look
- Clean white background with thin black grid lines (like graph paper)
- Head and shoulders only
- Photorealistic, shot on 35mm DSLR, shallow depth of field`

  // Step 2: Head Left — uses the front image as reference
  const geminiHeadLeft = `Using the character you just created, generate a LEFT PROFILE view (facing left, showing the left side of the face).

Rules:
- Same exact person — same face, same skin, same hair, same features
- Left side profile, head and shoulders
- Neutral expression
- Same clean white background with thin black grid lines
- Photorealistic, same quality as the front-facing shot`

  // Step 3: Head Right
  const geminiHeadRight = `Using the same character, generate a RIGHT PROFILE view (facing right, showing the right side of the face).

Rules:
- Same exact person — same face, same skin, same hair, same features
- Right side profile, head and shoulders
- Neutral expression
- Same clean white background with thin black grid lines
- Photorealistic, same quality as the previous shots`

  // Step 4: Body Front
  const geminiBodyFront = `Using the same character, generate a FULL BODY front-facing shot. Standing naturally, facing the camera.

This character's body: ${bodyDesc}.

Rules:
- Same exact person — same face, same skin, same hair
- Full body from head to feet, standing pose
- ${traits.clothingStyle ? `Wearing ${traits.clothingStyle.toLowerCase()} style clothing` : 'Casual outfit'}
- ${traits.bodyType ? `${traits.bodyType} body type` : 'Natural proportions'}
- Same clean white background with thin black grid lines
- Photorealistic, same quality as the previous shots`

  // Step 5: Body Left
  const geminiBodyLeft = `Using the same character, generate a FULL BODY LEFT PROFILE view. Standing, body turned to show the left side.

Rules:
- Same exact person — same face, same body proportions, same clothing
- Full body from head to feet, left profile standing pose
- Same clean white background with thin black grid lines
- Photorealistic, same quality as the previous shots`

  // Step 6: Body Right
  const geminiBodyRight = `Using the same character, generate a FULL BODY RIGHT PROFILE view. Standing, body turned to show the right side.

Rules:
- Same exact person — same face, same body proportions, same clothing
- Full body from head to feet, right profile standing pose
- Same clean white background with thin black grid lines
- Photorealistic, same quality as the previous shots`

  return {
    googleFaceQuery,
    googleBodyQuery,
    geminiHeadFront,
    geminiHeadLeft,
    geminiHeadRight,
    geminiBodyFront,
    geminiBodyLeft,
    geminiBodyRight,
  }
}

// Image type labels for display
export const IMAGE_TYPE_LABELS: Record<string, string> = {
  head_front: 'Head — Front',
  head_left: 'Head — Left',
  head_right: 'Head — Right',
  body_front: 'Body — Front',
  body_left: 'Body — Left',
  body_right: 'Body — Right',
}

export const IMAGE_TYPES = [
  'head_front',
  'head_left',
  'head_right',
  'body_front',
  'body_left',
  'body_right',
] as const

export type ImageType = typeof IMAGE_TYPES[number]
