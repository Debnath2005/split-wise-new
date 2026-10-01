import { createBrowserRouter, Navigate } from 'react-router';
import { AccountPage } from '../features/account/AccountPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { ActivityPage } from '../features/activity/ActivityPage';
import { ExpenseDetailPage } from '../features/expenses/ExpenseDetailPage';
import { FriendDetailPage } from '../features/friends/FriendDetailPage';
import { FriendsPage } from '../features/friends/FriendsPage';
import { GroupDetailPage } from '../features/groups/GroupDetailPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { AppShell } from './AppShell';
import { RedirectIfAuthed, RequireAuth } from './guards';

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/friends', element: <FriendsPage /> },
          { path: '/friends/:userId', element: <FriendDetailPage /> },
          { path: '/groups', element: <GroupsPage /> },
          { path: '/groups/:groupId', element: <GroupDetailPage /> },
          { path: '/expenses/:expenseId', element: <ExpenseDetailPage /> },
          { path: '/activity', element: <ActivityPage /> },
          { path: '/account', element: <AccountPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/friends" replace /> },
]);
