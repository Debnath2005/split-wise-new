import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Db } from './db/client.js';
import { HttpError, errorBody } from './errors.js';
import { loadSession } from './middleware/auth.js';
import { requireFetchHeader } from './middleware/csrf.js';
import {
  DEFAULT_RATE_LIMITS,
  createRateLimiters,
  type RateLimits,
} from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';

interface AppOptions {
  db: Db;
  /** Serve the built client (ADR-0014). Only set in production. */
  clientDistPath?: string;
  cookieSecure?: boolean;
  rateLimits?: RateLimits;
  logRequests?: boolean;
}

export function createApp({
  db,
  clientDistPath,
  cookieSecure = false,
  rateLimits = DEFAULT_RATE_LIMITS,
  logRequests = true,
}: AppOptions) {
  const app = express();
  const limiters = createRateLimiters(rateLimits);

  app.disable('x-powered-by');
  app.use(helmet());
  if (logRequests)
    app.use(pinoHttp({ redact: ['req.headers.cookie', 'res.headers["set-cookie"]'] }));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(limiters.api);
  api.use(requireFetchHeader);
  api.use(loadSession(db, cookieSecure));
  api.use(healthRouter(db));
  api.use(authRouter({ db, cookieSecure, limiters }));
  api.use(meRouter(db));
  api.use((_req, res) => {
    res.status(404).json(errorBody('NOT_FOUND', 'Route not found'));
  });
  app.use('/api/v1', api);

  if (clientDistPath) {
    app.use(express.static(clientDistPath));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile('index.html', { root: clientDistPath });
    });
  }

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json(errorBody(err.code, err.message, err.details));
      return;
    }
    // body-parser errors (malformed JSON, payload too large) carry a 4xx status.
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 400 && status < 500) {
      res.status(status).json(errorBody('VALIDATION_ERROR', 'Request body could not be read'));
      return;
    }
    req.log?.error(err);
    res.status(500).json(errorBody('INTERNAL', 'Something went wrong'));
  };
  app.use(onError);

  return app;
}
