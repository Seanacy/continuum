import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { db } from './db'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-me'
)

const TOKEN_NAME = 'continuum-session'
const EXPIRY = '7d'

// ============================================
// Password hashing
// ============================================
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ============================================
// JWT token creation & verification
// ============================================
export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET)
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as { userId: string }
  } catch {
    return null
  }
}

// ============================================
// Session management (cookie-based)
// ============================================
export async function setSession(userId: string) {
  const token = await createToken(userId)
  const cookieStore = await cookies()
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOKEN_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(TOKEN_NAME)
}

// ============================================
// Get current user from session
// ============================================
export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      aiName: true,
      createdAt: true,
      onboardingComplete: true,
    },
  })

  return user
}
