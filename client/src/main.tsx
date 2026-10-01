import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ApiRequestError } from './api/client';
import { router } from './app/router';
// Self-hosted fonts (DESIGN.md adaptations: the CSP blocks Google Fonts).
import '@fontsource/sofia-sans/400.css';
import '@fontsource/sofia-sans/500.css';
import '@fontsource/sofia-sans/600.css';
import '@fontsource/sofia-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network/5xx failures, never 4xx (those won't fix themselves).
      retry: (count, err) =>
        count < 2 && !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
