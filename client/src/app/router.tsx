import { createBrowserRouter, Navigate } from 'react-router';
import { AccountPage } from '../features/account/AccountPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { ComingSoonPage } from '../features/comingSoon/ComingSoonPage';
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
          { path: '/friends', element: <ComingSoonPage title="Friends" milestone="M2" /> },
          { path: '/groups', element: <ComingSoonPage title="Groups" milestone="M2" /> },
          { path: '/activity', element: <ComingSoonPage title="Activity" milestone="M5" /> },
          { path: '/account', element: <AccountPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/friends" replace /> },
]);
