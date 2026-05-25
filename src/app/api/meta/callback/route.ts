// GET /api/meta/callback — Facebook OAuth callback
// Facebook redirects here after user authorizes the app
// We exchange the code for tokens, fetch pages/ad accounts, and save everything

import { NextRequest, NextResponse } from 'next/server'
import {
  validateState,
  exchangeCodeForToken,
  getLongLivedToken,
  getMetaUserProfile,
  getUserPages,
  getInstagramAccount,
  getAdAccounts,
  saveFacebookAccount,
} from '@/lib/meta-auth'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-app-two.vercel.app'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // User denied permission
  if (error) {
    return NextResponse.redirect(`${APP_URL}/home?tab=settings&meta_error=denied`)
  }

  // Missing required params
  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/home?tab=settings&meta_error=missing_params`)
  }

  try {
    // 1. Validate CSRF state — decrypts to userId
    const userId = validateState(state)
    if (!userId) {
      return NextResponse.redirect(`${APP_URL}/home?tab=settings&meta_error=invalid_state`)
    }

    // 2. Exchange auth code for short-lived token
    const { accessToken: shortToken } = await exchangeCodeForToken(code)

    // 3. Exchange for long-lived token (60 day expiry)
    const { accessToken: longToken, expiresIn } = await getLongLivedToken(shortToken)
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000)

    // 4. Get Facebook user profile
    const fbProfile = await getMetaUserProfile(longToken)

    // 5. Get user's Facebook Pages
    const pages = await getUserPages(longToken)
    const firstPage = pages[0] || null

    // 6. Get Instagram business account (if page exists)
    let igAccountId: string | null = null
    if (firstPage) {
      igAccountId = await getInstagramAccount(firstPage.id, firstPage.access_token)
    }

    // 7. Get ad accounts
    const adAccounts = await getAdAccounts(longToken)
    const firstAdAccount = adAccounts[0] || null

    // 8. Save everything to database
    await saveFacebookAccount({
      userId,
      fbUserId: fbProfile.id,
      accessToken: longToken,
      tokenExpiresAt,
      fbPageId: firstPage?.id,
      fbPageName: firstPage?.name,
      fbPageAccessToken: firstPage?.access_token,
      igAccountId: igAccountId || undefined,
      adAccountId: firstAdAccount?.id,
      permissions: [
        'ads_management',
        'ads_read',
        'business_management',
        'pages_read_engagement',
        'pages_show_list',
      ],
    })

    // 9. Redirect back to app with success
    return NextResponse.redirect(`${APP_URL}/home?tab=settings&meta_connected=true`)
  } catch (error: any) {
    console.error('Meta callback error:', error)
    return NextResponse.redirect(
      `${APP_URL}/home?tab=settings&meta_error=${encodeURIComponent(error.message || 'auth_failed')}`
    )
  }
}
