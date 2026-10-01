import type { SettlementListItem } from '@split-wise/shared';
import { useDeleteSettlement } from '../../api/settlements';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Money } from '../../components/ui/Money';
import { Sheet } from '../../components/ui/Sheet';
import { formatLongDate } from '../../lib/dates';

const METHOD: Record<SettlementListItem['method'], string> = {
  upi: 'UPI',
  cash: 'Cash',
  other: 'Other',
};

/** A recorded payment, with Delete (SPEC §9: from, to, or a group member). */
export function SettlementSheet({
  settlement,
  meId,
  onClose,
}: {
  settlement: SettlementListItem | null;
  meId: number;
  onClose: () => void;
}) {
  const remove = useDeleteSettlement();
  const name = (p: { id: number; name: string }) => (p.id === meId ? 'You' : p.name);
  return (
    <Sheet
      open={settlement !== null}
      onClose={() => {
        remove.reset();
        onClose();
      }}
      title="Payment"
      footer={
        settlement && (
          <Button
            variant="secondary"
            fullWidth
            loading={remove.isPending}
            onClick={() => remove.mutate(settlement.id, { onSuccess: onClose })}
          >
            Delete payment
          </Button>
        )
      }
    >
      {settlement && (
        <div className="flex flex-col gap-3">
          <p className="text-2xl">
            <span className="font-semibold">{name(settlement.from)}</span> paid{' '}
            <span className="font-semibold">{name(settlement.to)}</span>
          </p>
          <Money paise={settlement.amount_paise} className="text-4xl font-bold" />
          <p className="text-lg text-chalk-muted">
            {METHOD[settlement.method]} · {formatLongDate(settlement.settled_on)}
            {settlement.group ? ` · ${settlement.group.name}` : ' · No group'}
          </p>
          {settlement.note && <p className="break-words">“{settlement.note}”</p>}
          <p className="text-lg text-chalk-muted">
            Payments are self-reported. Deleting one brings the debt back for everyone.
          </p>
          {remove.isError && <Alert tone="error">{remove.error.message}</Alert>}
        </div>
      )}
    </Sheet>
  );
}
