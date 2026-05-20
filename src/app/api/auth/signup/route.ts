import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, setSession } from '@/lib/auth'
import { signupSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = signupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      )
    }

    const { email, password, name, aiName } = parsed.data

    // Check if user exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      )
    }

    // Create user
    const hashedPassword = await hashPassword(password)
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        aiName,
      },
    })

    // Create initial AI state for this user
    await db.aiState.create({
      data: {
        userId: user.id,
        tone: 'warm',
        energy: 'neutral',
        traits: JSON.stringify(['attentive', 'curious']),
        context: JSON.stringify({}),
      },
    })

    // Set session cookie
    await setSession(user.id)

    return NextResponse.json(
      { user: { id: user.id, email: user.email, aiName: user.aiName } },
      { status: 201 }
    )
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
