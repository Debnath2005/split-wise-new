import { config } from './config.js';
import { createDb } from './db/client.js';
import { createApp } from './app.js';

const db = createDb(config.databasePath);
const app = createApp({
  db,
  cookieSecure: config.cookieSecure,
  ...(config.isProduction && { clientDistPath: config.clientDistPath }),
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
