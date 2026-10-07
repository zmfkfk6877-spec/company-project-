import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...extra });
  if (result.status !== 0) throw new Error(command + ' failed; inspect the output above.');
}
process.env.XDG_CACHE_HOME ||= '/workspace/.cache';
process.env.npm_config_cache ||= '/tmp/phishing-npm-cache';
mkdirSync(process.env.XDG_CACHE_HOME, { recursive: true });
mkdirSync('.local', { recursive: true });
if (!existsSync('.env')) {
  const password = randomBytes(24).toString('hex');
  writeFileSync(
    '.env',
    `DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5432/phishingquiz\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=phishingquiz\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nPUBLIC_URL=http://localhost:3000\nCOOKIE_SECURE=false\nTRUST_PROXY=false\nADMIN_USERNAME=admin\nADMIN_INITIAL_PASSWORD=${randomBytes(24).toString('base64url')}!9a\nUPLOAD_DIR=${path.resolve('.local/uploads')}\n`,
    { mode: 0o600 },
  );
}
chmodSync('.env', 0o600);
const config = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const url = new URL(config.DATABASE_URL);
const local = ['localhost', '127.0.0.1'].includes(url.hostname);
const name = 'phishing-quiz-db';
let created = false;
if (local) {
  const pg = {
    POSTGRES_USER: decodeURIComponent(url.username),
    POSTGRES_PASSWORD: decodeURIComponent(url.password),
    POSTGRES_DB: url.pathname.slice(1),
  };
  const inspect = spawnSync('docker', ['inspect', '--format', '{{.State.Status}}', name], {
    encoding: 'utf8',
  });
  if (inspect.status !== 0) {
    run(
      'docker',
      [
        'run',
        '-d',
        '--name',
        name,
        '--env',
        'POSTGRES_USER',
        '--env',
        'POSTGRES_PASSWORD',
        '--env',
        'POSTGRES_DB',
        '-p',
        `127.0.0.1:${url.port || 5432}:5432`,
        '--mount',
        'type=volume,source=phishing-quiz-cloud-db,target=/var/lib/postgresql/data',
        'postgres:17-alpine',
      ],
      { env: { ...process.env, ...pg } },
    );
    created = true;
  } else if (inspect.stdout.trim() !== 'running') run('docker', ['start', name]);
  for (let i = 0; i < 30; i++) {
    const ready = spawnSync(
      'docker',
      ['exec', name, 'pg_isready', '-U', pg.POSTGRES_USER, '-d', pg.POSTGRES_DB],
      { stdio: 'ignore' },
    );
    if (ready.status === 0) break;
    await new Promise((r) => setTimeout(r, 1000));
    if (i === 29) throw Error('PostgreSQL did not become ready');
  }
  const tables = spawnSync(
    'docker',
    [
      'exec',
      name,
      'psql',
      '-U',
      pg.POSTGRES_USER,
      '-d',
      pg.POSTGRES_DB,
      '-At',
      '-c',
      "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'",
    ],
    { encoding: 'utf8' },
  );
  if (tables.status !== 0) throw Error('Cannot inspect existing database schema');
  if (created && tables.stdout.trim() === '0' && existsSync('.local/cloud-db.dump'))
    run(
      'docker',
      [
        'exec',
        '-i',
        name,
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '-U',
        pg.POSTGRES_USER,
        '-d',
        pg.POSTGRES_DB,
      ],
      { input: readFileSync('.local/cloud-db.dump'), stdio: ['pipe', 'inherit', 'inherit'] },
    );
}
if (process.argv.includes('--install'))
  run('npm', ['ci', '--cache', '/tmp/phishing-npm-cache', '--no-audit', '--no-fund']);
for (const command of ['db:generate', 'db:migrate', 'db:seed', 'admin:create'])
  run('npm', ['run', command]);
if (local) {
  const dump = spawnSync(
    'docker',
    [
      'exec',
      name,
      'pg_dump',
      '-U',
      decodeURIComponent(url.username),
      '-d',
      url.pathname.slice(1),
      '-Fc',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (dump.status !== 0) throw Error('Snapshot database export failed');
  writeFileSync('.local/cloud-db.dump', dump.stdout, { mode: 0o600 });
}
console.log(
  'Local configuration, database, migration, seed and administrator prepared. No credentials were printed.',
);
