import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { db } from './db';

// Resolve the migrations folder relative to this module so it works regardless
// of the current working directory. In dev (tsx) this file is server/src/migrate.ts
// and in prod (compiled) it is server/dist/migrate.js — both sit two levels below
// the repo/app root where drizzle/migrations lives.
const MIGRATIONS_FOLDER = path.join(__dirname, '..', '..', 'drizzle', 'migrations');

// Applies any pending Drizzle migrations from drizzle/migrations. Idempotent:
// drizzle tracks applied migrations in a __drizzle_migrations table, so already
// applied migrations are skipped. Safe to run on every boot.
//
// Set SKIP_MIGRATIONS=true to bypass (e.g. when migrations are run as a separate
// deploy step rather than at application startup).
export async function runMigrations(): Promise<void> {
  if (process.env['SKIP_MIGRATIONS'] === 'true') {
    process.stdout.write('Skipping migrations (SKIP_MIGRATIONS=true)\n');
    return;
  }

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  process.stdout.write('Database migrations applied\n');
}
