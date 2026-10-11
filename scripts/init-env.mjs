import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), '.env');
if (!existsSync(file)) {
  writeFileSync(file, `PLATFORM_ADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\nPOSTGRES_PASSWORD=${randomBytes(24).toString('base64url')}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created .env with separate random admin and database passwords.');
} else {
  const content = readFileSync(file, 'utf8');
  for (const key of ['PLATFORM_ADMIN_PASSWORD', 'POSTGRES_PASSWORD']) {
    if (!new RegExp(`^${key}=.{16,}$`, 'm').test(content)) throw new Error(`${key} must contain at least 16 characters in .env`);
  }
  console.log('Existing .env preserved.');
}
