import { useParams } from 'react-router';
import { basisPointsToPercentString, type ExpenseDetail } from '@split-wise/shared';
import { useMe } from '../../api/auth';
import { useExpense } from '../../api/expenses';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { BackLink } from '../../components/ui/BackLink';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { List, ListRow } from '../../components/ui/ListRow';
import { Money } from '../../components/ui/Money';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatLongDate } from '../../lib/dates';
import { ImpactText } from './ImpactText';

const SPLIT_LABEL: Record<ExpenseDetail['split_type'], string> = {
  equal: 'Split equally',
  exact: 'Split by exact amounts',
  percent: 'Split by percentages',
};

function Back({ expense }: { expense?: ExpenseDetail }) {
  return expense?.group ? (
    <BackLink to={`/groups/${expense.group.id}`}>{expense.group.name}</BackLink>
  ) : (
    <BackLink to="/friends">Friends</BackLink>
  );
}

export function ExpenseDetailPage() {
  const id = Number(useParams().expenseId);
  const query = useExpense(id);
  const { data: me } = useMe();

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return (
      <>
        <Back />
        <Alert tone="error">{query.error.message}</Alert>
      </>
    );
  }
  const expense = query.data;
  const meId = me?.id ?? 0;
  const you = (person: { id: number; name: string }) => (person.id === meId ? 'You' : person.name);
  const myShare = expense.shares.find((s) => s.user.id === meId)?.owed_paise ?? 0;

  return (
    <>
      <Back expense={expense} />
      <div className="flex flex-col gap-4">
        <Card>
          <h1 className="text-3xl/tight font-semibold break-words">{expense.description}</h1>
          <p className="mt-2 text-5xl/tight font-bold tracking-[-0.01em]">
            <Money paise={expense.amount_paise} />
          </p>
          <p className="mt-2 text-lg text-chalk-muted">
            {formatLongDate(expense.expense_date)}
            {expense.group ? ` · ${expense.group.name}` : ' · No group'}
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
            <span>
              <span className="font-semibold">{you(expense.paid_by)}</span> paid
            </span>
            <ImpactText
              amountPaise={expense.amount_paise}
              paidByUserId={expense.paid_by.id}
              mySharePaise={myShare}
              meId={meId}
            />
          </div>
        </Card>

        <section>
          <h2 className="mb-2 text-3xl/tight font-semibold">{SPLIT_LABEL[expense.split_type]}</h2>
          <List label="Shares">
            {expense.shares.map((s) => (
              <ListRow
                key={s.user.id}
                leading={<Avatar name={s.user.name} placeholder={s.user.is_placeholder} />}
                title={
                  <>
                    <span className="truncate">{you(s.user)}</span>
                    {s.user.is_placeholder && <Badge>Invited</Badge>}
                  </>
                }
                subtitle={
                  expense.split_type === 'percent' && s.input_value !== null
                    ? `${basisPointsToPercentString(s.input_value)}%`
                    : undefined
                }
                trailing={<Money paise={s.owed_paise} className="font-semibold" />}
              />
            ))}
          </List>
        </section>

        {expense.notes && (
          <Card title="Notes">
            <p className="whitespace-pre-wrap break-words">{expense.notes}</p>
          </Card>
        )}

        <p className="text-lg text-chalk-muted">
          Added by {you(expense.created_by)} on{' '}
          {new Date(expense.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>
    </>
  );
}
