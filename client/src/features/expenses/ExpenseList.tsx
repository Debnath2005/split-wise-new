import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ExpensePage } from '@split-wise/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { Money } from '../../components/ui/Money';
import { PageSpinner } from '../../components/ui/Spinner';
import { dateBadge } from '../../lib/dates';
import { ImpactText } from './ImpactText';

interface ExpenseListProps {
  query: UseInfiniteQueryResult<InfiniteData<ExpensePage>>;
  meId: number;
  /** Show which group each expense belongs to (friend page). */
  showGroup?: boolean;
  emptyText: string;
}

function DateBadge({ iso }: { iso: string }) {
  const { day, month } = dateBadge(iso);
  return (
    <span
      aria-hidden
      className="flex w-10 shrink-0 flex-col items-center leading-tight text-chalk-muted"
    >
      <span className="text-base uppercase">{month}</span>
      <span className="text-xl font-semibold text-chalk">{day}</span>
    </span>
  );
}

export function ExpenseList({ query, meId, showGroup = false, emptyText }: ExpenseListProps) {
  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;

  const items = query.data.pages.flatMap((p) => p.expenses);
  if (items.length === 0) return <EmptyState title="No expenses yet">{emptyText}</EmptyState>;

  return (
    <div className="flex flex-col gap-3">
      <List label="Expenses">
        {items.map((e) => {
          const payer = e.paid_by.id === meId ? 'You' : e.paid_by.name;
          const where = showGroup ? (e.group ? ` · ${e.group.name}` : ' · No group') : '';
          return (
            <ListRow
              key={e.id}
              to={`/expenses/${e.id}`}
              leading={<DateBadge iso={e.expense_date} />}
              title={<span className="truncate">{e.description}</span>}
              subtitle={
                <>
                  {payer} paid <Money paise={e.amount_paise} />
                  {where}
                </>
              }
              trailing={
                <ImpactText
                  amountPaise={e.amount_paise}
                  paidByUserId={e.paid_by.id}
                  mySharePaise={e.my_share_paise}
                  meId={meId}
                />
              }
            />
          );
        })}
      </List>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
