import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? './data/app.db',
  isProduction: process.env.NODE_ENV === 'production',
  clientDistPath: fileURLToPath(new URL('../../client/dist', import.meta.url)),
};
