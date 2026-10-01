import { Outlet } from 'react-router';
import { TabBar, type TabItem } from '../components/ui/TabBar';
import { AccountIcon, ActivityIcon, FriendsIcon, GroupsIcon } from '../components/ui/icons';
import { Brand } from './Brand';

const tabs: TabItem[] = [
  { to: '/friends', label: 'Friends', icon: <FriendsIcon /> },
  { to: '/groups', label: 'Groups', icon: <GroupsIcon /> },
  { to: '/activity', label: 'Activity', icon: <ActivityIcon /> },
  { to: '/account', label: 'Account', icon: <AccountIcon /> },
];

export function AppShell() {
  return (
    <div className="min-h-dvh md:pl-56">
      <main className="mx-auto max-w-2xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(9rem+env(safe-area-inset-bottom))] md:pt-10 md:pb-28">
        <Outlet />
      </main>
      <TabBar items={tabs} brand={<Brand />} />
    </div>
  );
}
