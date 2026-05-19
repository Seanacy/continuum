// Personi Integration
// Handles the bridge between Continuum and Personi (personi.vercel.app)
//
// Flow:
// 1. User clicks "Create Character" on Continuum
// 2. Continuum generates a signed token with user ID + timestamp
// 3. User is redirected to Personi with the token
// 4. Personi verifies the token, knows this is a Continuum user (free tier access)
// 5. User builds character on Personi
// 6. Personi redirects back to Continuum with a character ID
// 7. Continuum calls Personi's API to fetch the full character data
// 8. Continuum saves a local copy of the character + user uploads profile pics
//
// Env vars needed:
// - PERSONI_SHARED_SECRET: shared key for signing/verifying tokens (set on both sites)
// - PERSONI_API_URL: base URL for Personi's API (default: https://personi.vercel.app)
// - NEXT_PUBLIC_APP_URL: Continuum's own URL for the callback redirect
//
// Personi side needs:
// - An endpoint to verify the Continuum token and grant free-tier access
// - An endpoint to return character data by ID (GET /api/characters/:id)
// - A webhook endpoint on Continuum to receive character update notifications

import crypto from 'crypto'
import { db } from './db'

const PERSONI_API_URL = process.env.PERSONI_API_URL || 'https://personi.vercel.app'
const PERSONI_SECRET = process.env.PERSONI_SHARED_SECRET || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-app-two.vercel.app'

// ============================================
// GENERATE REDIRECT TOKEN — signs user info for Personi
// ============================================
export function generatePersoniToken(userId: string, email: string): string {
  const payload = {
    userId,
    email,
    source: 'continuum',
    timestamp: Date.now(),
    // Token expires in 10 minutes
    expiresAt: Date.now() + 10 * 60 * 1000,
  }

  const payloadStr = JSON.stringify(payload)
  const payloadB64 = Buffer.from(payloadStr).toString('base64url')

  // HMAC signature using shared secret
  const signature = crypto
    .createHmac('sha256', PERSONI_SECRET)
    .update(payloadB64)
    .digest('base64url')

  return `${payloadB64}.${signature}`
}

// ============================================
// VERIFY INCOMING TOKEN — verifies tokens FROM Personi
// (used when Personi sends webhook updates)
// ============================================
export function verifyPersoniToken(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const [payloadB64, signature] = token.split('.')
    if (!payloadB64 || !signature) return { valid: false }

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', PERSONI_SECRET)
      .update(payloadB64)
      .digest('base64url')

    if (signature !== expectedSig) return { valid: false }

    // Decode and check expiry
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return { valid: false }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// ============================================
// BUILD REDIRECT URL — sends user to Personi's builder
// ============================================
export function buildPersoniRedirectUrl(userId: string, email: string): string {
  const token = generatePersoniToken(userId, email)
  const callbackUrl = `${APP_URL}/api/personi/callback`

  return `${PERSONI_API_URL}/build?continuum_token=${encodeURIComponent(token)}&callback=${encodeURIComponent(callbackUrl)}`
}

// ============================================
// FETCH CHARACTER FROM PERSONI — pull character data via API
// ============================================
export interface PersoniCharacterData {
  id: string
  name: string
  personality: Record<string, unknown>  // full trait layers from Personi
  traits: string[]
  voiceStyle?: string
}

export async function fetchPersoniCharacter(personiCharId: string): Promise<PersoniCharacterData | null> {
  if (!PERSONI_SECRET) {
    console.error('[Personi] PERSONI_SHARED_SECRET not configured')
    return null
  }

  try {
    // Generate a short-lived API token for the request
    const apiToken = crypto
      .createHmac('sha256', PERSONI_SECRET)
      .update(`fetch:${personiCharId}:${Date.now()}`)
      .digest('base64url')

    const response = await fetch(`${PERSONI_API_URL}/api/characters/${personiCharId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'X-Source': 'continuum',
      },
    })

    if (!response.ok) {
      console.error(`[Personi] Failed to fetch character ${personiCharId}: ${response.status}`)
      return null
    }

    const data = await response.json()
    return {
      id: data.id,
      name: data.name,
      personality: data.personality || data.layers || {},
      traits: data.traits || [],
      voiceStyle: data.voiceStyle,
    }
  } catch (error) {
    console.error('[Personi] Fetch error:', error)
    return null
  }
}

// ============================================
// SYNC CHARACTER — save/update Personi character locally on Continuum
// ============================================
export async function syncCharacterFromPersoni(
  userId: string,
  personiCharId: string
): Promise<{ success: boolean; characterId?: string }> {
  const charData = await fetchPersoniCharacter(personiCharId)
  if (!charData) return { success: false }

  // Cast personality to Prisma-compatible JSON
  const personalityJson = JSON.parse(JSON.stringify(charData.personality))

  // Upsert — create or update the local character record
  const character = await db.character.upsert({
    where: {
      userId_personiId: { userId, personiId: personiCharId },
    },
    create: {
      userId,
      personiId: personiCharId,
      name: charData.name,
      personality: personalityJson,
      voiceStyle: charData.voiceStyle,
      lastSyncedAt: new Date(),
    },
    update: {
      name: charData.name,
      personality: personalityJson,
      voiceStyle: charData.voiceStyle,
      lastSyncedAt: new Date(),
    },
  })

  // Also store the Personi character ID on the user for quick access
  await db.user.update({
    where: { id: userId },
    data: { personiCharId },
  })

  return { success: true, characterId: character.id }
}
