import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { ApiError } from '@split-wise/shared';
import type { Db } from './db/client.js';
import { healthRouter } from './routes/health.js';

interface AppOptions {
  db: Db;
  /** Serve the built client (ADR-0014). Only set in production. */
  clientDistPath?: string;
  logRequests?: boolean;
}

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createApp({ db, clientDistPath, logRequests = true }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  if (logRequests) app.use(pinoHttp());
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(healthRouter(db));
  api.use((_req, res) => {
    res.status(404).json(apiError('NOT_FOUND', 'Route not found'));
  });
  app.use('/api/v1', api);

  if (clientDistPath) {
    app.use(express.static(clientDistPath));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile('index.html', { root: clientDistPath });
    });
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    req.log?.error(err);
    res.status(500).json(apiError('INTERNAL', 'Something went wrong'));
  };
  app.use(onError);

  return app;
}
