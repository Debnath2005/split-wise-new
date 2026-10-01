import { z } from 'zod';
import { MAX_AMOUNT_PAISE } from './lib/money/money.js';
import { SPLIT_TYPES } from './lib/money/split.js';
import { UPI_VPA_REGEX } from './lib/money/upi.js';

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

/** SPEC §8 VPA format, e.g. "ravi@okicici" (one definition, in lib/money/upi). */
export const UPI_VPA_PATTERN = UPI_VPA_REGEX;
/** E.164, e.g. "+919876543210". */
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

/** base64url of 32 random bytes. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
  /** From an invite link: claims that placeholder even if the email differs (ADR-0015). */
  invite_token: z.string().regex(INVITE_TOKEN_PATTERN).optional(),
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

/** A friend with your total pairwise balance across all groups and non-group (positive = they owe you). */
export const FriendSchema = PersonSchema.extend({ balance_paise: z.number().int() });
export type Friend = z.infer<typeof FriendSchema>;

export const FriendsResponseSchema = z.object({ friends: z.array(FriendSchema) });
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
  /** Your net in this group (positive = the group owes you). */
  my_net_paise: z.number().int(),
});
export type GroupSummary = z.infer<typeof GroupSummarySchema>;

export const GroupsResponseSchema = z.object({ groups: z.array(GroupSummarySchema) });
export type GroupsResponse = z.infer<typeof GroupsResponseSchema>;

export const FriendDetailResponseSchema = z.object({
  friend: PersonSchema,
  /** Their UPI ID (friends see it anyway when paying them). */
  upi_vpa: z.string().nullable(),
  /** True for a placeholder you created: you may set their UPI ID (SPEC §8). */
  can_edit_upi_vpa: z.boolean(),
  shared_groups: z.array(GroupSummarySchema),
  /** Pairwise balance with this friend (positive = they owe you), total and per scope (SPEC §6). */
  balance: z.object({
    total_paise: z.number().int(),
    /** One entry per scope with any shared expense; `group: null` is non-group. */
    by_scope: z.array(
      z.object({
        group: z.object({ id: z.number().int(), name: z.string() }).nullable(),
        balance_paise: z.number().int(),
      }),
    ),
  }),
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

/** Rename and/or turn simplify debts on or off (SPEC §10). */
export const UpdateGroupRequestSchema = z
  .object({ name: groupName.optional(), simplify_debts: z.boolean().optional() })
  .strict()
  .refine((g) => g.name !== undefined || g.simplify_debts !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>;

/** Add an existing friend by id, or a person by name + email/phone. */
export const AddGroupMemberRequestSchema = z.union([
  z.object({ user_id: userId }).strict(),
  PersonInputSchema,
]);
export type AddGroupMemberRequest = z.infer<typeof AddGroupMemberRequestSchema>;

/** How a settlement was paid (SPEC §5). The app can't verify any of them (ADR-0013). */
export const SETTLEMENT_METHODS = ['upi', 'cash', 'other'] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

// ── Expenses (SPEC §4.1, §5, §10) ───────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date "YYYY-MM-DD" between 2000 and 2100. */
export const ExpenseDateSchema = z.string().refine(
  (value) => {
    const m = ISO_DATE.exec(value);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 2000 || y > 2100) return false;
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  },
  { message: 'Enter a valid date' },
);

export const CreateExpenseRequestSchema = z
  .object({
    /** Omit or null for a non-group expense between friends. */
    group_id: userId.nullable().optional(),
    description: z
      .string()
      .trim()
      .min(1, 'Enter a description')
      .max(100, 'Keep it under 100 characters'),
    amount_paise: z
      .number()
      .int()
      .min(1, 'Enter an amount')
      .max(MAX_AMOUNT_PAISE, 'Amount is too large'),
    paid_by_user_id: userId,
    split_type: z.enum(SPLIT_TYPES),
    /** `value` is paise (exact) or basis points (percent); omitted for equal. Shares are computed server-side. */
    participants: z
      .array(z.object({ user_id: userId, value: z.number().int().min(0).optional() }).strict())
      .min(1, 'Pick at least one person')
      .max(MAX_GROUP_MEMBERS),
    expense_date: ExpenseDateSchema,
    notes: clearable(z.string().trim().max(500, 'Keep notes under 500 characters')).optional(),
  })
  .strict();
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;

/** Minimal person reference inside expenses. */
export const PersonRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  is_placeholder: z.boolean(),
});
export type PersonRef = z.infer<typeof PersonRefSchema>;

const GroupRefSchema = z.object({ id: z.number().int(), name: z.string() }).nullable();

export const ExpenseDetailSchema = z.object({
  id: z.number().int(),
  group: GroupRefSchema,
  description: z.string(),
  amount_paise: z.number().int(),
  currency: z.literal('INR'),
  split_type: z.enum(SPLIT_TYPES),
  expense_date: z.string(),
  notes: z.string().nullable(),
  paid_by: PersonRefSchema,
  created_by: PersonRefSchema,
  created_at: z.number().int(),
  version: z.number().int(),
  shares: z.array(
    z.object({
      user: PersonRefSchema,
      owed_paise: z.number().int(),
      input_value: z.number().int().nullable(),
    }),
  ),
});
export type ExpenseDetail = z.infer<typeof ExpenseDetailSchema>;

export const ExpenseResponseSchema = z.object({ expense: ExpenseDetailSchema });
export type ExpenseResponse = z.infer<typeof ExpenseResponseSchema>;

export const ExpenseListItemSchema = z.object({
  kind: z.literal('expense'),
  id: z.number().int(),
  group: GroupRefSchema,
  description: z.string(),
  amount_paise: z.number().int(),
  expense_date: z.string(),
  split_type: z.enum(SPLIT_TYPES),
  paid_by: PersonRefSchema,
  /** The viewer's owed share; 0 when they aren't a participant. */
  my_share_paise: z.number().int(),
});
export type ExpenseListItem = z.infer<typeof ExpenseListItemSchema>;

/** A settlement as it appears in expense lists. */
export const SettlementListItemSchema = z.object({
  kind: z.literal('settlement'),
  id: z.number().int(),
  group: GroupRefSchema,
  from: PersonRefSchema,
  to: PersonRefSchema,
  amount_paise: z.number().int(),
  method: z.enum(SETTLEMENT_METHODS),
  note: z.string().nullable(),
  settled_on: z.string(),
});
export type SettlementListItem = z.infer<typeof SettlementListItemSchema>;

export const LedgerListItemSchema = z.discriminatedUnion('kind', [
  ExpenseListItemSchema,
  SettlementListItemSchema,
]);
export type LedgerListItem = z.infer<typeof LedgerListItemSchema>;

export const ExpensePageSchema = z.object({
  /** Expenses and settlements, newest date first. */
  expenses: z.array(LedgerListItemSchema),
  /** Pass as `before` to get the next (older) page; null when there are no more. */
  next_cursor: z.string().nullable(),
});
export type ExpensePage = z.infer<typeof ExpensePageSchema>;

/** Cursor for expense lists: "<date>.<e|s>.<id>" of the last item seen (e = expense, s = settlement). */
export const EXPENSE_CURSOR_PATTERN = /^\d{4}-\d{2}-\d{2}\.[es]\.\d+$/;

// ── Balances (SPEC §6, §10) ─────────────────────────────────────────────────

export const GroupBalancesResponseSchema = z.object({
  /** Every member, plus any former member who still appears in the group's expenses. */
  members: z.array(z.object({ user: PersonRefSchema, net_paise: z.number().int() })),
  /** Who pays whom. Raw pairwise debts netted per pair until simplify debts (M7). */
  transfers: z.array(
    z.object({ from: PersonRefSchema, to: PersonRefSchema, amount_paise: z.number().int() }),
  ),
  simplified: z.boolean(),
});
export type GroupBalancesResponse = z.infer<typeof GroupBalancesResponseSchema>;

export const BalanceSummaryResponseSchema = z.object({
  owe_paise: z.number().int(),
  owed_paise: z.number().int(),
  net_paise: z.number().int(),
});
export type BalanceSummaryResponse = z.infer<typeof BalanceSummaryResponseSchema>;

// ── Editing & activity (SPEC §9, §10) ───────────────────────────────────────

/** Full replace of an expense, minus its group (fixed at creation), plus the version being edited. */
export const UpdateExpenseRequestSchema = CreateExpenseRequestSchema.omit({ group_id: true })
  .extend({ version: z.number().int().min(1) })
  .strict();
export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseRequestSchema>;

export const ACTIVITY_TYPES = [
  'expense_created',
  'expense_updated',
  'expense_deleted',
  'expense_restored',
  'settlement_created',
  'settlement_deleted',
  'group_created',
  'member_added',
  'member_left',
  'friend_added',
  'group_settings_changed',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** What an activity stores about an expense at one point in time (activities.payload). */
export const ExpenseSnapshotSchema = z.object({
  id: z.number().int(),
  description: z.string(),
  amount_paise: z.number().int(),
  paid_by_user_id: z.number().int(),
  split_type: z.enum(SPLIT_TYPES),
  expense_date: z.string(),
  shares: z.array(z.object({ user_id: z.number().int(), owed_paise: z.number().int() })),
});
export type ExpenseSnapshot = z.infer<typeof ExpenseSnapshotSchema>;

const NamedRef = z.object({ id: z.number().int(), name: z.string() });

/** What an activity stores about a settlement. */
export const SettlementSnapshotSchema = z.object({
  id: z.number().int(),
  from_user_id: z.number().int(),
  to_user_id: z.number().int(),
  amount_paise: z.number().int(),
  method: z.enum(SETTLEMENT_METHODS),
  settled_on: z.string(),
  note: z.string().nullable(),
});
export type SettlementSnapshot = z.infer<typeof SettlementSnapshotSchema>;

/** Stored payload per activity type. */
export const ActivityPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('expense_created'),
    payload: z.object({ expense: ExpenseSnapshotSchema }),
  }),
  z.object({
    type: z.literal('expense_restored'),
    payload: z.object({ expense: ExpenseSnapshotSchema }),
  }),
  z.object({
    type: z.literal('expense_updated'),
    payload: z.object({ before: ExpenseSnapshotSchema, after: ExpenseSnapshotSchema }),
  }),
  z.object({
    type: z.literal('expense_deleted'),
    payload: z.object({ before: ExpenseSnapshotSchema }),
  }),
  z.object({ type: z.literal('friend_added'), payload: z.object({ friend: NamedRef }) }),
  z.object({
    type: z.literal('group_created'),
    payload: z.object({ group: NamedRef, member_ids: z.array(z.number().int()) }),
  }),
  z.object({ type: z.literal('member_added'), payload: z.object({ member: NamedRef }) }),
  z.object({ type: z.literal('member_left'), payload: z.object({ member: NamedRef }) }),
  z.object({
    type: z.literal('group_settings_changed'),
    payload: z.object({
      before: z.object({ name: z.string().optional(), simplify_debts: z.boolean().optional() }),
      after: z.object({ name: z.string().optional(), simplify_debts: z.boolean().optional() }),
    }),
  }),
  z.object({
    type: z.literal('settlement_created'),
    payload: z.object({ settlement: SettlementSnapshotSchema }),
  }),
  z.object({
    type: z.literal('settlement_deleted'),
    payload: z.object({ before: SettlementSnapshotSchema }),
  }),
]);
export type ActivityPayload = z.infer<typeof ActivityPayloadSchema>;

export const ActivityItemSchema = z.intersection(
  z.object({
    id: z.number().int(),
    actor: PersonRefSchema,
    group: z.object({ id: z.number().int(), name: z.string() }).nullable(),
    expense_id: z.number().int().nullable(),
    settlement_id: z.number().int().nullable(),
    created_at: z.number().int(),
    read: z.boolean(),
    /** True only for a still-deleted expense the viewer may restore. */
    can_restore: z.boolean(),
  }),
  ActivityPayloadSchema,
);
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const ActivityPageSchema = z.object({
  items: z.array(ActivityItemSchema),
  /** Names of everyone mentioned in this page's payloads (id → name), for writing sentences. */
  people: z.record(z.string(), z.string()),
  /** Pass as `before` for older items; null when there are no more. */
  next_cursor: z.number().int().nullable(),
});
export type ActivityPage = z.infer<typeof ActivityPageSchema>;

export const UnreadCountResponseSchema = z.object({ count: z.number().int() });
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

// ── Settlements (SPEC §5, §8, §10) ──────────────────────────────────────────

export const CreateSettlementRequestSchema = z
  .object({
    /** Omit or null for a non-group settlement between friends. */
    group_id: userId.nullable().optional(),
    from_user_id: userId,
    to_user_id: userId,
    amount_paise: z
      .number()
      .int()
      .min(1, 'Enter an amount')
      .max(MAX_AMOUNT_PAISE, 'Amount is too large'),
    method: z.enum(SETTLEMENT_METHODS),
    note: clearable(z.string().trim().max(200, 'Keep the note under 200 characters')).optional(),
    settled_on: ExpenseDateSchema,
  })
  .strict()
  .refine((s) => s.from_user_id !== s.to_user_id, {
    message: 'Pick two different people',
    path: ['to_user_id'],
  });
export type CreateSettlementRequest = z.infer<typeof CreateSettlementRequestSchema>;

export const SettlementResponseSchema = z.object({ settlement: SettlementListItemSchema });
export type SettlementResponse = z.infer<typeof SettlementResponseSchema>;

export const UpiLinkResponseSchema = z.object({
  uri: z.string(),
  vpa: z.string(),
  payee_name: z.string(),
});
export type UpiLinkResponse = z.infer<typeof UpiLinkResponseSchema>;

/** Set the UPI ID of a placeholder you created (SPEC §8). Blank clears it. */
export const UpdatePlaceholderRequestSchema = z
  .object({
    upi_vpa: clearable(
      z.string().trim().regex(UPI_VPA_PATTERN, 'Enter a valid UPI ID, e.g. name@okicici'),
    ),
  })
  .strict();
export type UpdatePlaceholderRequest = z.infer<typeof UpdatePlaceholderRequestSchema>;

// ── Invite links (ADR-0015) ─────────────────────────────────────────────────

export const InviteResponseSchema = z.object({
  /** Put in the link: /invite/<token>. Shown once; only its hash is stored. */
  token: z.string(),
  expires_at: z.number().int(),
});
export type InviteResponse = z.infer<typeof InviteResponseSchema>;

/** Public preview. Unknown, expired and used tokens all look the same. */
export const InvitePreviewResponseSchema = z.discriminatedUnion('valid', [
  z.object({ valid: z.literal(true), inviter_name: z.string(), invitee_name: z.string() }),
  z.object({ valid: z.literal(false) }),
]);
export type InvitePreviewResponse = z.infer<typeof InvitePreviewResponseSchema>;
