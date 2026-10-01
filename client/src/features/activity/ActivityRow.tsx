import { Link } from 'react-router';
import type { ActivityItem } from '@split-wise/shared';
import { useRestoreExpense } from '../../api/activity';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Money } from '../../components/ui/Money';
import { cx } from '../../components/ui/cx';
import { formatRelative } from '../../lib/dates';
import { describeActivity } from './describe';

/** "you get back ₹200" / "you owe ₹375" (SPEC §9); muted "was: …" for deleted expenses. */
function Impact({ paise, past }: { paise: number; past: boolean }) {
  if (paise === 0) return null;
  const getsBack = paise > 0;
  const words = past
    ? getsBack
      ? 'was: you got back'
      : 'was: you owed'
    : getsBack
      ? 'you get back'
      : 'you owe';
  return (
    <span
      className={cx(
        'flex shrink-0 flex-col items-end text-right text-lg leading-tight',
        past ? 'text-chalk-muted' : getsBack ? 'text-positive' : 'text-negative',
      )}
    >
      <span>{words}</span>
      <Money paise={Math.abs(paise)} className="font-semibold" />
    </span>
  );
}

/** One feed item: sentence, changes, time, your impact, unread dot and (if allowed) Restore. */
export function ActivityRow({
  item,
  people,
  meId,
}: {
  item: ActivityItem;
  people: Record<string, string>;
  meId: number;
}) {
  const { sentence, changes, impact, impactIsPast } = describeActivity(item, people, meId);
  const restore = useRestoreExpense();
  const linkable = item.expense_id !== null && item.type !== 'expense_deleted';

  const body = (
    <span className="min-w-0 flex-1">
      <span className="block text-xl/snug">
        {sentence.map((s, i) => (
          <span key={i} className={cx(s.strong && 'font-semibold', s.em && 'text-accent')}>
            {s.text}
          </span>
        ))}
      </span>
      {changes.length > 0 && (
        <span className="block text-lg/snug text-chalk-muted">{changes.join(' · ')}</span>
      )}
      <span className="block text-base text-chalk-muted">{formatRelative(item.created_at)}</span>
    </span>
  );

  return (
    <li className={cx('relative flex items-start gap-3 px-4 py-3', !item.read && 'bg-accent/5')}>
      {!item.read && (
        <span aria-label="New" className="absolute top-5 left-1.5 size-2 rounded-full bg-accent" />
      )}
      <Avatar name={item.actor.name} placeholder={item.actor.is_placeholder} />
      {linkable ? (
        <Link to={`/expenses/${item.expense_id}`} className="min-w-0 flex-1 hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
      <span className="flex shrink-0 flex-col items-end gap-2">
        {impact !== null && <Impact paise={impact} past={impactIsPast} />}
        {item.can_restore && item.expense_id !== null && (
          <Button
            variant="secondary"
            loading={restore.isPending}
            onClick={() => restore.mutate(item.expense_id!)}
          >
            Restore
          </Button>
        )}
        {restore.isError && (
          <span className="max-w-40 text-right text-base text-danger">{restore.error.message}</span>
        )}
      </span>
    </li>
  );
}
