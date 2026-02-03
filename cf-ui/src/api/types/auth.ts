import type {components} from '../generated/schema';
import {z} from 'zod';

export type SignupRequest = components['schemas']['SignupRequest'];
export type SignupResponse = components['schemas']['TokenResponse'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type TokenResponse = components['schemas']['TokenResponse'];
export type RefreshTokenRequest = components['schemas']['RefreshTokenRequest'];
export type TokenRefreshResponse = components['schemas']['TokenRefreshResponse'];

export const SignupRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(100, 'Username must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, hyphens, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});
