import { useEffect, useRef, useState } from 'react';
import {
  formatPaise,
  paiseToRupeeString,
  parseRupeesToPaise,
  type PersonRef,
  type SettlementMethod,
} from '@split-wise/shared';
import { useMe } from '../../api/auth';
import { useCreateSettlement, useUpiLink } from '../../api/settlements';
import { Alert } from '../../components/ui/Alert';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { List, ListRow } from '../../components/ui/ListRow';
import { Money } from '../../components/ui/Money';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { copyText } from '../../lib/clipboard';
import { todayLocal } from '../../lib/dates';

/** One debt that can be settled: who pays whom, how much is outstanding, and in which scope. */
export interface SettleOption {
  from: PersonRef;
  to: PersonRef;
  amountPaise: number;
  group: { id: number; name: string } | null;
}

/** Phones get the UPI button; mouse-driven screens get the QR code (SPEC §8). */
const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

function UpiQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Generated locally (no external service); chalk colours keep strong contrast for scanners.
    // Loaded on demand, so the QR library stays out of the main bundle.
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(uri, {
          margin: 2,
          width: 240,
          color: { dark: '#1A1A2E', light: '#F5F5DC' },
        }),
      )
      .then(
        (url) => alive && setSrc(url),
        () => alive && setSrc(null),
      );
    return () => {
      alive = false;
    };
  }, [uri]);
  return src ? (
    <img
      src={src}
      alt="UPI QR code — scan with any UPI app"
      className="mx-auto size-60 rounded-control"
    />
  ) : (
    <Skeleton className="mx-auto size-60" />
  );
}

function SettleForm({ option, onDone }: { option: SettleOption; onDone: () => void }) {
  const { data: me } = useMe();
  const meId = me?.id ?? 0;
  const create = useCreateSettlement();
  const [amountText, setAmountText] = useState(paiseToRupeeString(option.amountPaise));
  const [phase, setPhase] = useState<'pay' | 'confirm' | 'record'>('pay');
  const [method, setMethod] = useState<SettlementMethod>('cash');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [showQr, setShowQr] = useState(!isTouchDevice());
  const [copied, setCopied] = useState<'yes' | 'select' | null>(null);
  const vpaInput = useRef<HTMLInputElement>(null);

  const amount = parseRupeesToPaise(amountText);
  const amountPaise = amount.ok ? amount.value : null;
  const iPay = option.from.id === meId;
  const upi = useUpiLink({
    toUserId: option.to.id,
    amountPaise,
    groupId: option.group?.id ?? null,
    enabled: iPay,
  });
  const name = (p: PersonRef) => (p.id === meId ? 'You' : p.name);
  const over = amountPaise !== null && amountPaise > option.amountPaise;

  const record = (m: SettlementMethod) => {
    if (amountPaise === null) return;
    create.mutate(
      {
        group_id: option.group?.id ?? null,
        from_user_id: option.from.id,
        to_user_id: option.to.id,
        amount_paise: amountPaise,
        method: m,
        note: m === 'upi' ? null : note,
        settled_on: date,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xl">
        <span className="font-semibold">{name(option.from)}</span> →{' '}
        <span className="font-semibold">{name(option.to)}</span>
        {option.group && <span className="text-chalk-muted"> · {option.group.name}</span>}
      </p>

      <AmountInput
        label="Amount"
        size="lg"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        error={amount.ok ? undefined : 'Enter an amount like 250 or 99.50'}
        hint={`Outstanding ${formatPaise(option.amountPaise)}`}
      />
      {over && (
        <p className="-mt-3 text-base text-yellow">
          That's more than the outstanding {formatPaise(option.amountPaise)}.
        </p>
      )}

      {create.isError && <Alert tone="error">{create.error.message}</Alert>}

      {phase === 'confirm' && (
        // SPEC §8 step 3: after the UPI app, ask before recording anything.
        <section className="flex flex-col gap-3 rounded-card border-[1.5px] border-dashed border-accent p-4">
          <h3 className="text-xl font-bold">Did the payment go through?</h3>
          <Button fullWidth loading={create.isPending} onClick={() => record('upi')}>
            Yes, record it
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setPhase('pay')}>
            Not now
          </Button>
        </section>
      )}

      {phase === 'pay' && iPay && (
        <section className="flex flex-col gap-3">
          {upi.isPending && amountPaise !== null ? (
            <Skeleton className="h-11 w-full" />
          ) : upi.data ? (
            <>
              {isTouchDevice() && (
                <a
                  href={upi.data.uri}
                  onClick={() => setPhase('confirm')}
                  className="chalk-press inline-flex min-h-14 items-center justify-center rounded-control border-[1.5px] border-accent bg-accent px-4 text-xl font-semibold text-slate"
                >
                  Pay {amountPaise !== null ? formatPaise(amountPaise) : ''} via UPI
                </a>
              )}
              {showQr ? (
                <div className="flex flex-col gap-2 text-center">
                  <UpiQr uri={upi.data.uri} />
                  <p className="text-base text-chalk-muted">
                    Scan with any UPI app, then come back here.
                  </p>
                  <Button variant="secondary" onClick={() => setPhase('confirm')}>
                    I've paid
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setShowQr(true)}>
                  Show QR code instead
                </Button>
              )}
              {/* Always offer the UPI ID itself (SPEC §8: some apps block pre-filled links). */}
              <div className="flex items-end gap-2">
                <TextField
                  ref={vpaInput}
                  label={`${option.to.name}'s UPI ID`}
                  value={upi.data.vpa}
                  readOnly
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={() =>
                    void copyText(upi.data!.vpa, vpaInput.current).then((ok) =>
                      setCopied(ok ? 'yes' : 'select'),
                    )
                  }
                >
                  Copy
                </Button>
              </div>
              {copied && (
                <p className="-mt-1 text-base text-chalk-muted">
                  {copied === 'yes' ? 'Copied.' : 'Selected — use your phone’s Copy.'}
                </p>
              )}
            </>
          ) : upi.data === null ? (
            <Alert tone="error">
              {option.to.name} hasn't added a UPI ID yet — ask them to add it, or record a cash
              payment.
            </Alert>
          ) : null}
        </section>
      )}

      {phase === 'pay' && (
        <Button variant="secondary" onClick={() => setPhase('record')}>
          Record a cash/other payment
        </Button>
      )}

      {phase === 'record' && (
        <section className="flex flex-col gap-4">
          <Select
            label="How was it paid?"
            value={method}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI (already paid)' },
              { value: 'other', label: 'Other' },
            ]}
            onChange={(e) => setMethod(e.target.value as SettlementMethod)}
          />
          <TextField
            label="Note (optional)"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button
            fullWidth
            loading={create.isPending}
            disabled={amountPaise === null}
            onClick={() => record(method)}
          >
            Record {amountPaise !== null ? <Money paise={amountPaise} /> : ''} payment
          </Button>
          <Button variant="secondary" onClick={() => setPhase('pay')}>
            Back
          </Button>
        </section>
      )}
    </div>
  );
}

/**
 * Settle up (SPEC §8, §11.7). With several options (a friend owed in more than one scope) it
 * first lists them; each settlement is recorded in its own scope so every balance reaches 0.
 */
export function SettleUpSheet({
  open,
  onClose,
  options,
}: {
  open: boolean;
  onClose: () => void;
  options: SettleOption[];
}) {
  const { data: me } = useMe();
  const [chosen, setChosen] = useState<SettleOption | null>(null);
  const close = () => {
    setChosen(null);
    onClose();
  };
  const active = chosen ?? (options.length === 1 ? options[0]! : null);
  const meId = me?.id ?? 0;

  return (
    <Sheet open={open} onClose={close} title="Settle up">
      {open && active && (
        <SettleForm
          key={`${active.group?.id ?? 'none'}:${active.from.id}`}
          option={active}
          onDone={close}
        />
      )}
      {open && !active && (
        <div className="flex flex-col gap-3">
          <p className="text-chalk-muted">
            Each balance is settled where it was made, so it really reaches zero.
          </p>
          <List label="Balances to settle">
            {options.map((o) => (
              <ListRow
                key={`${o.group?.id ?? 'none'}:${o.from.id}`}
                onClick={() => setChosen(o)}
                title={
                  <span className="truncate">{o.group ? o.group.name : 'Non-group expenses'}</span>
                }
                subtitle={`${o.from.id === meId ? 'You' : o.from.name} → ${o.to.id === meId ? 'you' : o.to.name}`}
                trailing={<Money paise={o.amountPaise} className="font-semibold" />}
              />
            ))}
          </List>
        </div>
      )}
    </Sheet>
  );
}
