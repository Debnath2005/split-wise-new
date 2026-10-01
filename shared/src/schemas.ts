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
/** Spaces and dashes are stripped, then the number must be E.164. */
const phoneNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(PHONE_PATTERN, 'Use international format, e.g. +919876543210'));
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

export const SignupRequestSchema = z.object({
  name,
  email,
  password: newPassword,
  /** Optional; also used to claim a placeholder that was added by phone (SPEC §5). */
  phone: clearable(phoneNumber).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UpdateMeRequestSchema = z
  .object({
    name: name.optional(),
    phone: clearable(phoneNumber).optional(),
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

// ── People, friends & groups (SPEC §5, §10) ─────────────────────────────────

/** Someone to add as a friend or group member: an existing user is matched by email or phone. */
export const PersonInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(50, 'Name is too long'),
    email: clearable(email).optional(),
    phone: clearable(phoneNumber).optional(),
  })
  .refine((p) => p.email || p.phone, {
    message: 'Add an email or a phone number',
    path: ['email'],
  });
export type PersonInput = z.infer<typeof PersonInputSchema>;

/** Another user as seen by their friends and fellow group members. */
export const PersonSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** True until they sign up and claim the account. */
  is_placeholder: z.boolean(),
});
export type Person = z.infer<typeof PersonSchema>;

export const FriendsResponseSchema = z.object({ friends: z.array(PersonSchema) });
export type FriendsResponse = z.infer<typeof FriendsResponseSchema>;

export const AddFriendResponseSchema = z.object({ friend: PersonSchema });
export type AddFriendResponse = z.infer<typeof AddFriendResponseSchema>;

/** Groups can have at most this many members (SPEC §12). */
export const MAX_GROUP_MEMBERS = 50;

const groupName = z.string().trim().min(1, 'Enter a group name').max(50, 'Name is too long');
const userId = z.number().int().positive();

export const GroupSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  member_count: z.number().int(),
});
export type GroupSummary = z.infer<typeof GroupSummarySchema>;

export const GroupsResponseSchema = z.object({ groups: z.array(GroupSummarySchema) });
export type GroupsResponse = z.infer<typeof GroupsResponseSchema>;

export const FriendDetailResponseSchema = z.object({
  friend: PersonSchema,
  shared_groups: z.array(GroupSummarySchema),
});
export type FriendDetailResponse = z.infer<typeof FriendDetailResponseSchema>;

export const GroupDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  simplify_debts: z.boolean(),
  created_by_user_id: z.number().int(),
  members: z.array(PersonSchema),
});
export type GroupDetail = z.infer<typeof GroupDetailSchema>;

export const GroupDetailResponseSchema = z.object({ group: GroupDetailSchema });
export type GroupDetailResponse = z.infer<typeof GroupDetailResponseSchema>;

export const CreateGroupRequestSchema = z
  .object({
    name: groupName,
    /** Existing friends of the creator. */
    member_ids: z
      .array(userId)
      .max(MAX_GROUP_MEMBERS - 1)
      .default([]),
    /** People to add by name + email/phone (existing users are matched, others become placeholders). */
    new_members: z
      .array(PersonInputSchema)
      .max(MAX_GROUP_MEMBERS - 1)
      .default([]),
  })
  .strict();
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;

export const UpdateGroupRequestSchema = z.object({ name: groupName }).strict();
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;

/** Add an existing friend by id, or a person by name + email/phone. */
export const AddGroupMemberRequestSchema = z.union([
  z.object({ user_id: userId }).strict(),
  PersonInputSchema,
]);
export type AddGroupMemberRequest = z.infer<typeof AddGroupMemberRequestSchema>;
