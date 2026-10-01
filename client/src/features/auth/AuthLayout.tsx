import type { ReactNode } from 'react';
import { Brand } from '../../app/Brand';
import { Card } from '../../components/ui/Card';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-8">
      <div className="mb-8">
        <Brand />
      </div>
      <h1 className="mb-6 text-4xl/tight font-bold tracking-[-0.01em]">{title}</h1>
      <Card>{children}</Card>
    </main>
  );
}
