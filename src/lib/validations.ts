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
  image: z.string().optional(), // base64 image data
  imageType: z.string().optional(), // mime type like image/jpeg
  timezone: z.string().optional(), // e.g. "America/New_York"
  localTime: z.string().optional(), // e.g. "2025-03-15T14:30:00"
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type MessageInput = z.infer<typeof messageSchema>
