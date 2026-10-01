import { fileURLToPath } from 'node:url';

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? './data/app.db',
  isProduction,
  /** Secure cookies need HTTPS; COOKIE_SECURE=false allows plain-HTTP LAN testing of a prod build. */
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  clientDistPath: fileURLToPath(new URL('../../client/dist', import.meta.url)),
};
