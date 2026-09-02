import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';

const config = loadConfig();
const destination = process.argv[2] ?? path.resolve('backups', `poker-express-${Date.now()}.db`);
await mkdir(path.dirname(destination), { recursive: true });
const db = new Database(config.databasePath, { readonly: true });
try {
  await db.backup(destination);
  process.stdout.write(`${destination}\n`);
} finally {
  db.close();
}

