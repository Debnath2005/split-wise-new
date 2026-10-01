import { useEffect } from 'react';
import { useMe } from '../../api/auth';
import { useActivityFeed, useMarkAllRead } from '../../api/activity';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSpinner } from '../../components/ui/Spinner';
import { ActivityIcon } from '../../components/ui/icons';
import { ActivityRow } from './ActivityRow';

/** SPEC §9 feed: newest first, cursor pagination, unread highlight; opening it marks all read. */
export function ActivityPage() {
  const { data: me } = useMe();
  const feed = useActivityFeed();
  const markRead = useMarkAllRead();
  const loaded = feed.isSuccess;
  const { mutate } = markRead;

  // Mark read once the feed is on screen, so this visit can still highlight what was new.
  useEffect(() => {
    if (loaded) mutate();
  }, [loaded, mutate]);

  if (feed.isPending) return <PageSpinner />;
  if (feed.isError) return <Alert tone="error">{feed.error.message}</Alert>;

  const pages = feed.data.pages;
  const items = pages.flatMap((p) => p.items.map((item) => ({ item, people: p.people })));

  return (
    <>
      <PageHeader title="Activity" />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" icon={<ActivityIcon />}>
          Expenses, edits and new groups will show up here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <ul
            aria-label="Activity"
            className="chalk-stagger divide-y divide-dashed divide-line overflow-hidden rounded-card border-[1.5px] border-dashed border-line-strong bg-board-raised shadow-card"
          >
            {items.map(({ item, people }) => (
              <ActivityRow key={item.id} item={item} people={people} meId={me?.id ?? 0} />
            ))}
          </ul>
          {feed.hasNextPage && (
            <Button
              variant="secondary"
              loading={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </>
  );
}
