import { useBalanceSummary } from '../../api/balances';
import { Money } from '../../components/ui/Money';
import { Skeleton } from '../../components/ui/Spinner';

/** "You owe ₹X · You are owed ₹Y" (SPEC §6 dashboard), straight from GET /balances/summary. */
export function SummaryHeader() {
  const summary = useBalanceSummary();
  if (summary.isError) return null;

  const cell = (label: string, paise: number | undefined, tone: string) => (
    <div className="flex flex-col">
      <span className="text-base text-chalk-muted">{label}</span>
      {paise === undefined ? (
        <Skeleton className="mt-1 h-7 w-24" />
      ) : (
        <Money
          paise={paise}
          className={`text-xl font-semibold ${paise === 0 ? 'text-chalk-muted' : tone}`}
        />
      )}
    </div>
  );

  return (
    <section
      aria-label="Your balance"
      className="animate-chalk-in mb-5 grid grid-cols-2 gap-4 rounded-card border-[1.5px] border-dashed border-line-strong bg-board-raised p-4 shadow-card"
    >
      {cell('You owe', summary.data?.owe_paise, 'text-negative')}
      {cell('You are owed', summary.data?.owed_paise, 'text-positive')}
    </section>
  );
}
