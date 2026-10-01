import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { ExpensePage, SettlementListItem } from '@split-wise/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { Money } from '../../components/ui/Money';
import { PageSpinner } from '../../components/ui/Spinner';
import { PaymentIcon } from '../../components/ui/icons';
import { SettlementSheet } from '../settle/SettlementSheet';
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
      <span className="text-sm uppercase">{month}</span>
      <span className="text-lg font-semibold text-chalk">{day}</span>
    </span>
  );
}

export function ExpenseList({ query, meId, showGroup = false, emptyText }: ExpenseListProps) {
  const [openSettlement, setOpenSettlement] = useState<SettlementListItem | null>(null);
  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;

  const items = query.data.pages.flatMap((p) => p.expenses);
  if (items.length === 0) return <EmptyState title="No expenses yet">{emptyText}</EmptyState>;
  const who = (p: { id: number; name: string }) => (p.id === meId ? 'You' : p.name);
  const where = (g: { name: string } | null) =>
    showGroup ? (g ? ` · ${g.name}` : ' · No group') : '';

  return (
    <div className="flex flex-col gap-3">
      <List label="Expenses">
        {items.map((e) =>
          e.kind === 'expense' ? (
            <ListRow
              key={`e${e.id}`}
              to={`/expenses/${e.id}`}
              leading={<DateBadge iso={e.expense_date} />}
              title={<span className="truncate">{e.description}</span>}
              subtitle={
                <>
                  {who(e.paid_by)} paid <Money paise={e.amount_paise} />
                  {where(e.group)}
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
          ) : (
            <ListRow
              key={`s${e.id}`}
              onClick={() => setOpenSettlement(e)}
              leading={<DateBadge iso={e.settled_on} />}
              title={
                <span className="flex items-center gap-2 truncate">
                  <span className="text-accent">
                    <PaymentIcon />
                  </span>
                  {who(e.from)} paid {e.to.id === meId ? 'you' : e.to.name}
                </span>
              }
              subtitle={`${e.method === 'upi' ? 'UPI' : e.method === 'cash' ? 'Cash' : 'Payment'}${where(e.group)}`}
              trailing={
                <span
                  className={`flex shrink-0 flex-col items-end text-right text-base leading-tight ${
                    e.to.id === meId
                      ? 'text-positive'
                      : e.from.id === meId
                        ? 'text-negative'
                        : 'text-chalk-muted'
                  }`}
                >
                  <span>
                    {e.to.id === meId
                      ? 'you received'
                      : e.from.id === meId
                        ? 'you paid'
                        : 'between them'}
                  </span>
                  <Money paise={e.amount_paise} className="font-semibold" />
                </span>
              }
            />
          ),
        )}
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
      <SettlementSheet
        settlement={openSettlement}
        meId={meId}
        onClose={() => setOpenSettlement(null)}
      />
    </div>
  );
}
