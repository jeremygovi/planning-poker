import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  databasePath: string;
  migrationsDir: string;
  publicDir: string;
  publicOrigin: string | null;
  accessToken: string;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function secureToken(value: string | undefined): string {
  if (!value || value.length < 16 || value.length > 128) {
    throw new Error('ACCESS_TOKEN must contain between 16 and 128 characters');
  }
  return value;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? process.env.DATA_DIR ?? path.resolve('data');
  const config: Config = {
    port: overrides.port ?? positiveInteger(process.env.PORT, 3000, 'PORT'),
    host: overrides.host ?? process.env.HOST ?? '0.0.0.0',
    dataDir,
    databasePath: overrides.databasePath ?? path.join(dataDir, 'poker-express.db'),
    migrationsDir: overrides.migrationsDir ?? process.env.MIGRATIONS_DIR ?? path.resolve('migrations'),
    publicDir: overrides.publicDir ?? process.env.PUBLIC_DIR ?? path.resolve('dist/client'),
    publicOrigin: overrides.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? null,
    accessToken: overrides.accessToken ?? secureToken(process.env.ACCESS_TOKEN)
  };
  if (config.publicOrigin) {
    const origin = new URL(config.publicOrigin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== config.publicOrigin) {
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path');
    }
  }
  return config;
}
