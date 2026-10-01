import { z } from 'zod';

/** Error envelope for every non-2xx API response (SPEC §10). */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'error']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ── Users & auth (SPEC §5, §10) ─────────────────────────────────────────────

/** SPEC §8 VPA format, e.g. "ravi@okicici". */
export const UPI_VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/;
/** E.164, e.g. "+919876543210". */
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

const name = z.string().trim().min(1, 'Enter your name').max(50, 'Name is too long');
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email'));
const newPassword = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

/** Optional text field: a blank string (or null) clears it. Input type stays `string | null`. */
const clearable = <T extends z.ZodType<string, string>>(schema: T) =>
  z
    .string()
    .nullable()
    .transform((v) => (v === null || v.trim() === '' ? null : v))
    .pipe(schema.nullable());

export const SignupRequestSchema = z.object({ name, email, password: newPassword });
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UpdateMeRequestSchema = z
  .object({
    name: name.optional(),
    phone: clearable(
      z
        .string()
        .trim()
        .transform((v) => v.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(PHONE_PATTERN, 'Use international format, e.g. +919876543210')),
    ).optional(),
    upi_vpa: clearable(
      z.string().trim().regex(UPI_VPA_PATTERN, 'Enter a valid UPI ID, e.g. name@okicici'),
    ).optional(),
  })
  .strict();
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;

export const ChangePasswordRequestSchema = z.object({
  current: z.string().min(1, 'Enter your current password').max(128),
  next: newPassword,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  upi_vpa: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;
