import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CreateExpenseRequestSchema,
  UpdateExpenseRequestSchema,
  ExpenseDateSchema,
  basisPointsToPercentString,
  computeSplit,
  formatPaise,
  parsePercentToBasisPoints,
  parseRupeesToPaise,
  paiseToRupeeString,
  type ExpenseDetail,
  type PersonRef,
  type SplitParticipant,
  type SplitResult,
  type SplitType,
} from '@split-wise/shared';
import { useMe } from '../../api/auth';
import { ApiRequestError } from '../../api/client';
import { expenseKeys, useCreateExpense, useUpdateExpense } from '../../api/expenses';
import { useFriends } from '../../api/friends';
import { useGroup, useGroups } from '../../api/groups';
import { Alert } from '../../components/ui/Alert';
import { AmountInput } from '../../components/ui/AmountInput';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Money } from '../../components/ui/Money';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import { TextField } from '../../components/ui/TextField';
import { Textarea } from '../../components/ui/Textarea';
import { cx } from '../../components/ui/cx';
import { todayLocal } from '../../lib/dates';

/** Where the sheet was opened from; pre-fills "With" (SPEC §11). */
export interface ExpenseContext {
  groupId?: number;
  friendId?: number;
}

const SPLIT_OPTIONS: { value: SplitType; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'By exact amounts' },
  { value: 'percent', label: 'By percentages' },
];

const AMOUNT_ERRORS = {
  INVALID_FORMAT: 'Enter an amount like 250 or 99.50',
  TOO_SMALL: 'Enter an amount above ₹0',
  TOO_LARGE: 'The most one expense can be is ₹10,00,000',
} as const;

type Status = { tone: 'ok' | 'warn' | 'muted'; text: string };

/** Turns the live split result into the footer line ("₹120.00 left to assign", "Adds up"). */
function describeSplit(
  splitType: SplitType,
  result: SplitResult | null,
  people: number,
  hasRowErrors: boolean,
): Status {
  if (hasRowErrors) return { tone: 'warn', text: 'Fix the highlighted values' };
  if (!result) return { tone: 'muted', text: 'Enter the amount to see the split' };
  if (result.ok) {
    return {
      tone: 'ok',
      text:
        splitType === 'equal'
          ? `Split equally between ${people} ${people === 1 ? 'person' : 'people'}`
          : 'Adds up — ready to save',
    };
  }
  const { error } = result;
  if (error.code === 'INVALID_SPLIT') {
    return { tone: 'warn', text: people === 0 ? 'Pick at least one person' : error.message };
  }
  const over = error.remaining < 0;
  const size = Math.abs(error.remaining);
  const amount =
    splitType === 'percent' ? `${basisPointsToPercentString(size)}%` : formatPaise(size);
  return { tone: 'warn', text: over ? `${amount} too much` : `${amount} left to assign` };
}

/** Edit-mode starting values for the per-person inputs, from the stored split input (ADR-0008). */
function initialValues(e: ExpenseDetail): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of e.shares) {
    if (s.input_value === null) continue;
    out[s.user.id] =
      e.split_type === 'exact'
        ? paiseToRupeeString(s.input_value)
        : basisPointsToPercentString(s.input_value);
  }
  return out;
}

function AddExpenseForm({
  context,
  editing,
  onDone,
  onConflict,
}: {
  context: ExpenseContext;
  /** When set, the form edits this expense (PUT with its version) instead of creating one. */
  editing?: ExpenseDetail;
  onDone: () => void;
  onConflict: (message: string) => void;
}) {
  const { data: me } = useMe();
  const groups = useGroups();
  const friends = useFriends();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense(editing?.id ?? 0);
  const saving = createExpense.isPending || updateExpense.isPending;

  // People on the expense being edited (payer + split), who may stay even if not your friends.
  const onExpense: PersonRef[] = editing
    ? [editing.paid_by, ...editing.shares.map((s) => s.user)].filter(
        (p, i, all) => all.findIndex((q) => q.id === p.id) === i,
      )
    : [];

  const [groupId, setGroupId] = useState<number | null>(
    editing ? (editing.group?.id ?? null) : (context.groupId ?? null),
  );
  const [friendIds, setFriendIds] = useState<Set<number>>(
    () =>
      new Set(editing ? onExpense.map((p) => p.id) : context.friendId ? [context.friendId] : []),
  );
  const group = useGroup(groupId ?? 0, { enabled: groupId !== null });

  const [description, setDescription] = useState(editing?.description ?? '');
  const [amountText, setAmountText] = useState(
    editing ? paiseToRupeeString(editing.amount_paise) : '',
  );
  const [paidBy, setPaidBy] = useState<number | null>(editing?.paid_by.id ?? null);
  const [splitType, setSplitType] = useState<SplitType>(editing?.split_type ?? 'equal');
  // null = derive from the expense being edited (everyone not in its split is unticked).
  const [excludedState, setExcluded] = useState<Set<number> | null>(editing ? null : new Set());
  const [values, setValues] = useState<Record<number, string>>(() =>
    editing ? initialValues(editing) : {},
  );
  const [date, setDate] = useState(editing?.expense_date ?? todayLocal());
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const meRef: PersonRef | null = me ? { id: me.id, name: me.name, is_placeholder: false } : null;

  /**
   * Everyone who can pay or share: the group's members, or you plus the friends you picked
   * (plus, when editing, anyone already on the expense).
   */
  const picked = (friends.data ?? []).filter((f) => friendIds.has(f.id));
  const pool: PersonRef[] = groupId
    ? (group.data?.members ?? [])
    : [...(meRef ? [meRef] : []), ...picked, ...onExpense].filter(
        (p, i, all) => all.findIndex((q) => q.id === p.id) === i,
      );
  const inSplit = new Set(editing?.shares.map((s) => s.user.id) ?? []);
  const excluded =
    excludedState ?? new Set(pool.filter((p) => !inSplit.has(p.id)).map((p) => p.id));

  const payerId = paidBy !== null && pool.some((p) => p.id === paidBy) ? paidBy : (me?.id ?? null);
  const amount = parseRupeesToPaise(amountText);

  // Per-person values (exact: rupees, percent: %). Blank means "not in this split".
  const rowErrors: Record<number, string> = {};
  const participants: SplitParticipant[] = [];
  for (const person of pool) {
    if (splitType === 'equal') {
      if (!excluded.has(person.id)) participants.push({ userId: person.id });
      continue;
    }
    const text = values[person.id]?.trim() ?? '';
    if (!text) continue;
    const parsed =
      splitType === 'exact'
        ? parseRupeesToPaise(text, { min: 0 })
        : parsePercentToBasisPoints(text);
    if (parsed.ok) participants.push({ userId: person.id, value: parsed.value });
    else
      rowErrors[person.id] =
        splitType === 'exact' ? 'Invalid amount' : 'Use up to 2 decimals, max 100';
  }
  const hasRowErrors = Object.keys(rowErrors).length > 0;

  const result =
    amount.ok && !hasRowErrors
      ? computeSplit({ amountPaise: amount.value, splitType, participants })
      : null;
  const status = describeSplit(splitType, result, participants.length, hasRowErrors);
  const owedBy = new Map(result?.ok ? result.shares.map((s) => [s.userId, s.owedPaise]) : []);
  const dateOk = ExpenseDateSchema.safeParse(date).success;
  const canSave =
    !!description.trim() && amount.ok && !!result?.ok && dateOk && payerId !== null && !saving;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!canSave || !amount.ok || payerId === null) return;
    const fields = {
      description,
      amount_paise: amount.value,
      paid_by_user_id: payerId,
      split_type: splitType,
      participants: participants.map((p) =>
        p.value === undefined ? { user_id: p.userId } : { user_id: p.userId, value: p.value },
      ),
      expense_date: date,
      notes,
    };
    try {
      if (editing) {
        const body = UpdateExpenseRequestSchema.safeParse({ ...fields, version: editing.version });
        if (!body.success)
          return setFormError(body.error.issues[0]?.message ?? 'Some fields are invalid');
        await updateExpense.mutateAsync(body.data);
      } else {
        const body = CreateExpenseRequestSchema.safeParse({ ...fields, group_id: groupId });
        if (!body.success)
          return setFormError(body.error.issues[0]?.message ?? 'Some fields are invalid');
        await createExpense.mutateAsync(body.data);
      }
      onDone();
    } catch (err) {
      // Someone else saved first (ADR-0009): the sheet reloads the latest version.
      if (err instanceof ApiRequestError && err.status === 409 && editing)
        return onConflict(err.message);
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const withOptions = [
    { value: '', label: 'No group — just friends' },
    ...(groups.data ?? []).map((g) => ({ value: String(g.id), label: g.name })),
  ];
  const payerOptions = pool.map((p) => ({
    value: String(p.id),
    label: p.id === me?.id ? `${p.name} (you)` : p.name,
  }));

  return (
    <form id="add-expense" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError && <Alert tone="error">{formError}</Alert>}

      <Select
        label="With"
        value={groupId ? String(groupId) : ''}
        options={
          editing?.group && !withOptions.some((o) => o.value === String(editing.group!.id))
            ? [...withOptions, { value: String(editing.group.id), label: editing.group.name }]
            : withOptions
        }
        disabled={!!editing}
        onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
      />
      {editing && (
        <p className="-mt-3 text-lg text-chalk-muted">
          An expense's group can't be changed. To move it, delete it and add it again.
        </p>
      )}

      {!groupId && (
        <fieldset>
          <legend className="mb-1 text-lg font-semibold">Friends in this expense</legend>
          {friends.data?.length ? (
            friends.data.map((f) => (
              <Checkbox
                key={f.id}
                checked={friendIds.has(f.id)}
                onChange={(on) =>
                  setFriendIds((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(f.id);
                    else next.delete(f.id);
                    return next;
                  })
                }
              >
                <Avatar name={f.name} placeholder={f.is_placeholder} />
                <span className="truncate">{f.name}</span>
              </Checkbox>
            ))
          ) : (
            <p className="text-lg text-chalk-muted">
              {friends.isPending ? 'Loading friends…' : 'Add a friend first to split with them.'}
            </p>
          )}
        </fieldset>
      )}

      <TextField
        label="Description"
        placeholder="Dinner, cab, groceries…"
        autoComplete="off"
        maxLength={100}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={submitted && !description.trim() ? 'Enter a description' : undefined}
      />

      <AmountInput
        label="Amount"
        size="lg"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        error={
          !amount.ok && (submitted || (amountText.trim() !== '' && amount.error !== 'TOO_SMALL'))
            ? AMOUNT_ERRORS[amount.error]
            : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Paid by"
          value={payerId !== null ? String(payerId) : ''}
          options={payerOptions}
          onChange={(e) => setPaidBy(Number(e.target.value))}
        />
        <Select
          label="Split"
          value={splitType}
          options={SPLIT_OPTIONS}
          onChange={(e) => setSplitType(e.target.value as SplitType)}
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-lg font-semibold">
          {splitType === 'equal'
            ? 'Split between'
            : splitType === 'exact'
              ? 'Amount per person'
              : 'Percent per person'}
        </legend>
        {pool.length === 0 && (
          <p className="text-lg text-chalk-muted">
            {groupId ? 'Loading members…' : 'Pick at least one friend above.'}
          </p>
        )}
        <ul className="divide-y divide-line">
          {pool.map((person) => {
            const name = person.id === me?.id ? `${person.name} (you)` : person.name;
            const share = owedBy.get(person.id);
            if (splitType === 'equal') {
              const included = !excluded.has(person.id);
              return (
                <li key={person.id}>
                  <Checkbox
                    checked={included}
                    onChange={(on) =>
                      setExcluded(() => {
                        const next = new Set(excluded);
                        if (on) next.delete(person.id);
                        else next.add(person.id);
                        return next;
                      })
                    }
                  >
                    <Avatar name={person.name} placeholder={person.is_placeholder} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {included && share !== undefined && (
                      <Money paise={share} className="shrink-0 font-semibold" />
                    )}
                  </Checkbox>
                </li>
              );
            }
            return (
              <li key={person.id} className="flex items-start gap-3 py-2">
                <Avatar name={person.name} placeholder={person.is_placeholder} />
                <span className="min-w-0 flex-1 pt-2.5">
                  <span className="block truncate">{name}</span>
                  {splitType === 'percent' && share !== undefined && (
                    <Money paise={share} className="block text-lg text-chalk-muted" />
                  )}
                </span>
                <div className="w-32 shrink-0">
                  {splitType === 'exact' ? (
                    <AmountInput
                      label={`Amount for ${person.name}`}
                      hideLabel
                      value={values[person.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [person.id]: e.target.value }))}
                      error={rowErrors[person.id]}
                    />
                  ) : (
                    <TextField
                      label={`Percent for ${person.name}`}
                      hideLabel
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      suffix="%"
                      value={values[person.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [person.id]: e.target.value }))}
                      error={rowErrors[person.id]}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        error={dateOk ? undefined : 'Enter a valid date'}
      />
      <Textarea
        label="Notes (optional)"
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t-[1.5px] border-dashed border-line bg-board-raised px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p
          aria-live="polite"
          className={cx(
            'text-lg font-semibold',
            status.tone === 'ok' && 'text-positive',
            status.tone === 'warn' && 'text-yellow',
            status.tone === 'muted' && 'text-chalk-muted',
          )}
        >
          {status.text}
        </p>
        <Button type="submit" fullWidth loading={saving} disabled={!canSave}>
          {editing ? 'Save changes' : 'Save expense'}
        </Button>
      </div>
    </form>
  );
}

export function AddExpenseSheet({
  open,
  onClose,
  context = {},
  editing,
}: {
  open: boolean;
  onClose: () => void;
  context?: ExpenseContext;
  /** Edit this expense instead of adding one. */
  editing?: ExpenseDetail;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const close = () => {
    setConflict(null);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={editing ? 'Edit expense' : 'Add expense'}
      variant="full"
    >
      {open && (
        <>
          {conflict && (
            <div className="mb-5">
              <Alert tone="error">{conflict}</Alert>
            </div>
          )}
          {/* Keyed by version: after a conflict the refetched expense remounts a fresh form. */}
          <AddExpenseForm
            key={editing ? `${editing.id}:${editing.version}` : 'new'}
            context={context}
            editing={editing}
            onDone={close}
            onConflict={(message) => {
              setConflict(message);
              if (editing)
                void queryClient.invalidateQueries({ queryKey: expenseKeys.detail(editing.id) });
            }}
          />
        </>
      )}
    </Sheet>
  );
}
