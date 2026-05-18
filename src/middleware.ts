import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-me'
)

// Routes that require authentication
const protectedRoutes = ['/home', '/chat', '/feed', '/threads']

// Routes that should redirect to /home if already logged in
const authRoutes = ['/login', '/signup']

async function isTokenValid(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, SECRET)
    return true
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('continuum-session')?.value
  const { pathname } = req.nextUrl

  // Check if token actually verifies (not just exists)
  const validSession = token ? await isTokenValid(token) : false

  // If trying to access a protected route without a VALID session, redirect to login
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!validSession) {
      const response = NextResponse.redirect(new URL('/login', req.url))
      // Clear the invalid cookie so we don't loop
      if (token) {
        response.cookies.delete('continuum-session')
      }
      return response
    }
  }

  // If trying to access auth routes while logged in with a VALID session, redirect to home
  if (authRoutes.some((route) => pathname.startsWith(route))) {
    if (validSession) {
      return NextResponse.redirect(new URL('/home', req.url))
    }
    // If cookie exists but is invalid, clear it so auth pages work cleanly
    if (token && !validSession) {
      const response = NextResponse.next()
      response.cookies.delete('continuum-session')
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/home/:path*', '/chat/:path*', '/feed/:path*', '/threads/:path*', '/login', '/signup'],
}
