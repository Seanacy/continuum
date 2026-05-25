// Meta (Facebook/Instagram) OAuth + Token Management
// Handles the entire Facebook OAuth flow for connecting ad accounts
//
// Flow: User clicks "Connect Facebook" → redirect to FB login →
// FB redirects back with auth code → we exchange for tokens → store encrypted

import { db } from './db'
import crypto from 'crypto'

// ============================================
// CONSTANTS
// ============================================
const META_APP_ID = process.env.META_APP_ID || ''
const META_APP_SECRET = process.env.META_APP_SECRET || ''
const META_TOKEN_SECRET = process.env.META_TOKEN_SECRET || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-app-two.vercel.app'
const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// Permissions we request from the user
const REQUIRED_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  'pages_show_list',
  'pages_manage_ads',
  'public_profile',
  'email',
].join(',')

// ============================================
// TOKEN ENCRYPTION — AES-256-GCM
// ============================================
function encryptToken(token: string): string {
  if (!META_TOKEN_SECRET) throw new Error('META_TOKEN_SECRET not set')
  const key = Buffer.from(META_TOKEN_SECRET, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return iv.toString('hex') + ':' + authTag + ':' + encrypted
}

function decryptToken(encryptedData: string): string {
  if (!META_TOKEN_SECRET) throw new Error('META_TOKEN_SECRET not set')
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
  const key = Buffer.from(META_TOKEN_SECRET, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ============================================
// OAUTH URL — redirect user to Facebook login
// ============================================
export function getMetaOAuthUrl(userId: string): string {
  const state = encryptToken(userId) // CSRF protection — encrypt userId as state
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: `${APP_URL}/api/meta/callback`,
    scope: REQUIRED_SCOPES,
    state,
    response_type: 'code',
  })
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`
}

// ============================================
// EXCHANGE AUTH CODE FOR TOKENS
// ============================================
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: `${APP_URL}/api/meta/callback`,
    code,
  })

  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Token exchange failed: ${err.error?.message || res.statusText}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  }
}

// ============================================
// GET LONG-LIVED TOKEN (60 day expiry)
// ============================================
export async function getLongLivedToken(shortToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortToken,
  })

  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Long-lived token failed: ${err.error?.message || res.statusText}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000, // default 60 days
  }
}

// ============================================
// GET USER PROFILE
// ============================================
export async function getMetaUserProfile(accessToken: string): Promise<{
  id: string
  name: string
  email?: string
}> {
  const res = await fetch(`${GRAPH_BASE}/me?fields=id,name,email&access_token=${accessToken}`)
  if (!res.ok) throw new Error('Failed to get user profile')
  return res.json()
}

// ============================================
// GET USER'S FACEBOOK PAGES
// ============================================
export async function getUserPages(accessToken: string): Promise<Array<{
  id: string
  name: string
  access_token: string
  category: string
}>> {
  const res = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token,category&access_token=${accessToken}`)
  if (!res.ok) throw new Error('Failed to get pages')
  const data = await res.json()
  return data.data || []
}

// ============================================
// GET INSTAGRAM BUSINESS ACCOUNT FOR A PAGE
// ============================================
export async function getInstagramAccount(pageId: string, pageAccessToken: string): Promise<string | null> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.instagram_business_account?.id || null
}

// ============================================
// GET AD ACCOUNTS
// ============================================
export async function getAdAccounts(accessToken: string): Promise<Array<{
  id: string
  name: string
  account_status: number
  currency: string
}>> {
  const res = await fetch(`${GRAPH_BASE}/me/adaccounts?fields=id,name,account_status,currency&access_token=${accessToken}`)
  if (!res.ok) throw new Error('Failed to get ad accounts')
  const data = await res.json()
  return data.data || []
}

// ============================================
// VALIDATE STATE PARAM (CSRF protection)
// ============================================
export function validateState(state: string): string | null {
  try {
    return decryptToken(state) // returns userId if valid
  } catch {
    return null
  }
}

// ============================================
// SAVE FACEBOOK ACCOUNT TO DATABASE
// ============================================
export async function saveFacebookAccount(params: {
  userId: string
  fbUserId: string
  accessToken: string
  tokenExpiresAt: Date
  fbPageId?: string
  fbPageName?: string
  fbPageAccessToken?: string
  igAccountId?: string
  adAccountId?: string
  permissions: string[]
}): Promise<string> {
  const encrypted = encryptToken(params.accessToken)
  const encryptedPageToken = params.fbPageAccessToken
    ? encryptToken(params.fbPageAccessToken)
    : null

  const account = await db.facebookAccount.upsert({
    where: {
      userId_fbUserId: {
        userId: params.userId,
        fbUserId: params.fbUserId,
      },
    },
    create: {
      userId: params.userId,
      fbUserId: params.fbUserId,
      accessToken: encrypted,
      tokenExpiresAt: params.tokenExpiresAt,
      fbPageId: params.fbPageId || null,
      fbPageName: params.fbPageName || null,
      fbPageAccessToken: encryptedPageToken,
      igAccountId: params.igAccountId || null,
      adAccountId: params.adAccountId || null,
      permissions: params.permissions,
      status: 'active',
    },
    update: {
      accessToken: encrypted,
      tokenExpiresAt: params.tokenExpiresAt,
      fbPageId: params.fbPageId || null,
      fbPageName: params.fbPageName || null,
      fbPageAccessToken: encryptedPageToken,
      igAccountId: params.igAccountId || null,
      adAccountId: params.adAccountId || null,
      permissions: params.permissions,
      status: 'active',
    },
  })

  return account.id
}

// ============================================
// GET DECRYPTED ACCESS TOKEN FOR API CALLS
// ============================================
export async function getDecryptedToken(facebookAccountId: string): Promise<{
  accessToken: string
  pageAccessToken: string | null
  adAccountId: string | null
  fbPageId: string | null
  igAccountId: string | null
  status: string
} | null> {
  const account = await db.facebookAccount.findUnique({
    where: { id: facebookAccountId },
  })

  if (!account) return null

  // Check if token is expired
  if (account.tokenExpiresAt < new Date()) {
    await db.facebookAccount.update({
      where: { id: facebookAccountId },
      data: { status: 'expired' },
    })
    return { ...getDefaults(account), status: 'expired' }
  }

  return {
    accessToken: decryptToken(account.accessToken),
    pageAccessToken: account.fbPageAccessToken ? decryptToken(account.fbPageAccessToken) : null,
    adAccountId: account.adAccountId,
    fbPageId: account.fbPageId,
    igAccountId: account.igAccountId,
    status: account.status,
  }
}

function getDefaults(account: any) {
  return {
    accessToken: '',
    pageAccessToken: null,
    adAccountId: account.adAccountId,
    fbPageId: account.fbPageId,
    igAccountId: account.igAccountId,
  }
}

// ============================================
// GET USER'S CONNECTED FACEBOOK ACCOUNTS
// ============================================
export async function getUserFacebookAccounts(userId: string) {
  return db.facebookAccount.findMany({
    where: { userId },
    select: {
      id: true,
      fbUserId: true,
      fbPageId: true,
      fbPageName: true,
      igAccountId: true,
      adAccountId: true,
      status: true,
      tokenExpiresAt: true,
      permissions: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ============================================
// DISCONNECT FACEBOOK ACCOUNT
// ============================================
export async function disconnectFacebookAccount(accountId: string, userId: string): Promise<boolean> {
  const account = await db.facebookAccount.findFirst({
    where: { id: accountId, userId },
  })

  if (!account) return false

  await db.facebookAccount.update({
    where: { id: accountId },
    data: {
      status: 'revoked',
      accessToken: 'revoked',
      fbPageAccessToken: null,
    },
  })

  return true
}

// ============================================
// REFRESH TOKEN IF EXPIRING SOON
// ============================================
export async function refreshTokenIfNeeded(accountId: string): Promise<boolean> {
  const account = await db.facebookAccount.findUnique({
    where: { id: accountId },
  })

  if (!account || account.status !== 'active') return false

  // Refresh if expiring within 7 days
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  if (account.tokenExpiresAt.getTime() - Date.now() > sevenDays) return true // still fresh

  try {
    const currentToken = decryptToken(account.accessToken)
    const { accessToken, expiresIn } = await getLongLivedToken(currentToken)
    const newExpiry = new Date(Date.now() + expiresIn * 1000)

    await db.facebookAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encryptToken(accessToken),
        tokenExpiresAt: newExpiry,
      },
    })

    return true
  } catch (err) {
    console.error('Token refresh failed for account', accountId, err)
    await db.facebookAccount.update({
      where: { id: accountId },
      data: { status: 'expired' },
    })
    return false
  }
}
