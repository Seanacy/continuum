// ============================================
// VISUAL PROMPT GENERATOR
// Produces 9 outputs:
//   - 2 Google Image search queries (face ref, body ref)
//   - 6 Gemini generation prompts (head front/left/right, body front/left/right)
//   - 1 AI agent context (end-to-end instructions for browser-based generation + upload)
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
  // Full end-to-end AI agent instructions
  agentContext: string
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

// ============================================
// AI AGENT CONTEXT GENERATOR
// Produces step-by-step instructions for an AI agent
// with browser control (e.g. Claude with Chrome MCP)
// to generate all 6 profile images via Gemini and
// upload them to Continuum's API.
// ============================================

interface PromptWithType {
  imageType: string
  prompt: string
}

function generateAgentContext(
  characterName: string,
  prompts: PromptWithType[]
): string {
  const promptList = prompts
    .map((p, i) => `--- PROMPT ${i + 1} of ${prompts.length} (${IMAGE_TYPE_LABELS[p.imageType] || p.imageType}) ---\n${p.prompt}`)
    .join('\n\n')

  const imageTypeOrder = prompts.map((p, i) => `  ${i + 1}. ${p.imageType}`).join('\n')

  return `=== CONTINUUM VISUAL CREATOR — AI AGENT INSTRUCTIONS ===

You are generating 6 profile images for a character named "${characterName}" using Google Gemini's free image generation, then uploading each image to Continuum's API.

== PHASE 1: GENERATE ALL 6 IMAGES IN GEMINI ==

1. Open gemini.google.com in a browser tab.
2. For each of the 6 prompts below, do this:
   a. Paste the prompt text into the Gemini input box.
   b. Click the BLUE ARROW (↑) send button in the bottom-right corner to submit.
      IMPORTANT: Do NOT press Enter. Enter creates a newline — it does not submit.
   c. Wait for Gemini to fully generate the image before sending the next prompt.
3. Send all 6 prompts in this exact order. Do not skip any. Do not send the next prompt until the current image is fully generated.

== PHASE 2: CREATE A SHARE LINK (after ALL 6 images are generated) ==

IMPORTANT: Do not share until all 6 images are generated. Sharing early will create a link that is missing images.

4. Click the three-dot menu (⋮) in the top-right corner of the Gemini conversation.
5. Click "Share conversation" in the dropdown menu.
6. A dialog will appear with a share URL like gemini.google.com/share/XXXX. Copy this URL.

== PHASE 3: EXTRACT IMAGE URLs FROM THE SHARE PAGE ==

7. Open the share URL in a new browser tab.
8. Scroll from top to bottom of the entire share page. This triggers lazy-loading of all images. Scroll slowly enough that each image loads as you pass it.
9. After reaching the bottom, read the tab's network requests filtered by "lh3.googleusercontent.com".
10. From the network requests, identify the UNIQUE CDN URLs. There will be duplicates — ignore those. You should find exactly 7 unique URLs.
11. The URLs will end with "?alr=yes". These are the URLs you need.
12. Map the unique URLs to image types by their order of appearance. Skip the 1st unique URL (it's a reference portrait, not one of the 6 profile shots). Use URLs 2 through 7:
${imageTypeOrder}

== PHASE 4: UPLOAD EACH IMAGE TO CONTINUUM ==

13. For each of the 6 image URLs (2nd through 7th unique URL), run this JavaScript on the Continuum app tab (the tab open to continuum-app-two.vercel.app):

(async () => {
  const imageUrl = 'PASTE_CDN_URL_HERE';
  const imgRes = await fetch(imageUrl);
  const blob = await imgRes.blob();
  const file = new File([blob], '${characterName.toLowerCase().replace(/\s+/g, '_')}_IMAGE_TYPE.jpg', { type: blob.type || 'image/jpeg' });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('characterId', 'CHARACTER_ID_HERE');
  formData.append('imageType', 'IMAGE_TYPE_HERE');
  const res = await fetch('/api/characters/visual-images', { method: 'POST', body: formData });
  const data = await res.json();
  return JSON.stringify({ status: res.status, data });
})()

Replace:
- PASTE_CDN_URL_HERE → the CDN URL for this image (must include ?alr=yes)
- CHARACTER_ID_HERE → the character's ID from the database
- IMAGE_TYPE_HERE → one of: head_front, head_left, head_right, body_front, body_left, body_right

14. Run this for all 6 images. The API should return status 200 for each. The final upload should show totalImages: 6.

== VERIFICATION ==

15. After all 6 uploads, confirm the API returned totalImages: 6 on the last upload. This means all profile images are stored.

== THE 6 PROMPTS (send in this exact order) ==

${promptList}

=== END OF INSTRUCTIONS ===`
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

  // ---- AI AGENT CONTEXT ----
  // Full end-to-end instructions for an AI agent with browser control
  const agentContext = generateAgentContext(
    characterName,
    [
      { imageType: 'head_front', prompt: geminiHeadFront },
      { imageType: 'head_left', prompt: geminiHeadLeft },
      { imageType: 'head_right', prompt: geminiHeadRight },
      { imageType: 'body_front', prompt: geminiBodyFront },
      { imageType: 'body_left', prompt: geminiBodyLeft },
      { imageType: 'body_right', prompt: geminiBodyRight },
    ]
  )

  return {
    googleFaceQuery,
    googleBodyQuery,
    geminiHeadFront,
    geminiHeadLeft,
    geminiHeadRight,
    geminiBodyFront,
    geminiBodyLeft,
    geminiBodyRight,
    agentContext,
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
