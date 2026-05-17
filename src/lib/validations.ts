import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
  aiName: z.string().min(1, 'Give your AI a name').max(30),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

export const messageSchema = z.object({
  content: z.string().min(1).max(5000),
  threadId: z.string().optional(),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type MessageInput = z.infer<typeof messageSchema>
