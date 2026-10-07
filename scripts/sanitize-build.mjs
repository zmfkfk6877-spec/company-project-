import { readdir, rm } from 'node:fs/promises';
for (const name of await readdir('.next/standalone'))
  if (name === '.env' || name.startsWith('.env.'))
    await rm('.next/standalone/' + name, { force: true });
console.log('Standalone artifact excludes environment files.');
