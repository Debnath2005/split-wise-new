import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ApiRequestError } from './api/client';
import { router } from './app/router';
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
