import { readFileSync } from 'node:fs';
const password = readFileSync('.env', 'utf8').match(/^PLATFORM_ADMIN_PASSWORD=(.+)$/m)?.[1];
if (!password) throw new Error('Run node scripts/init-env.mjs first.');
console.log(`Username: admin\nPassword: ${password}`);
