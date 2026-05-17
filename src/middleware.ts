import { NextRequest, NextResponse } from 'next/server'

// Routes that require authentication
const protectedRoutes = ['/home', '/chat', '/feed', '/threads']

// Routes that should redirect to /home if already logged in
const authRoutes = ['/login', '/signup']

export function middleware(req: NextRequest) {
  const token = req.cookies.get('continuum-session')?.value
  const { pathname } = req.nextUrl

  // If trying to access a protected route without a session, redirect to login
  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  // If trying to access auth routes while logged in, redirect to home
  if (authRoutes.some((route) => pathname.startsWith(route))) {
    if (token) {
      return NextResponse.redirect(new URL('/home', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/home/:path*', '/chat/:path*', '/feed/:path*', '/threads/:path*', '/login', '/signup'],
}
