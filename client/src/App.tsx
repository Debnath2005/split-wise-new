import { Card } from './components/ui/Card';
import { useHealth } from './api/health';

type Status = 'checking' | 'ok' | 'error';

function StatusRow({ label, status }: { label: string; status: Status }) {
  const text = { checking: 'Checking…', ok: 'ok', error: 'unreachable' }[status];
  const dot = { checking: 'bg-gray-light-1', ok: 'bg-brand', error: 'bg-danger' }[status];
  return (
    <div className="flex min-h-11 items-center justify-between border-b border-gray-light-3 last:border-b-0">
      <span>{label}</span>
      <span
        className={`flex items-center gap-2 font-semibold ${status === 'error' ? 'text-danger' : ''}`}
      >
        <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
        {text}
      </span>
    </div>
  );
}

export function App() {
  const health = useHealth();
  const api: Status = health.isPending ? 'checking' : health.isError ? 'error' : 'ok';
  const db: Status = health.isPending ? 'checking' : health.data?.db === 'ok' ? 'ok' : 'error';

  return (
    <main className="mx-auto max-w-2xl px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <h1 className="mb-6 text-[32px]/tight font-bold tracking-tight">Split-wise</h1>
      <Card title="System status">
        <StatusRow label="API" status={api} />
        <StatusRow label="Database" status={db} />
      </Card>
    </main>
  );
}
