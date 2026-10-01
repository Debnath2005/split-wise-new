import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';

/** Placeholder for tabs whose milestone hasn't been built yet. */
export function ComingSoonPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Coming soon">This screen arrives in milestone {milestone}.</EmptyState>
    </>
  );
}
