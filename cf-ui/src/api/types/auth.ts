import {z} from 'zod';

export const SignupRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(100, 'Username must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, hyphens, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SignupResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal('bearer'),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string().email(),
    domain: z.string(),
    role: z.string()
  })
});

export type SignupResponse = z.infer<typeof SignupResponseSchema>;
