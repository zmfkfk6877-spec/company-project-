import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { db } from '../lib/db';
import { encrypt, identity, throttle } from '../lib/security';
const prefix = 'test-operations-' + randomBytes(4).toString('hex');
test.after(async () => {
  await db.event.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.auditLog.deleteMany({ where: { target: { startsWith: prefix } } });
  await db.rateLimit.deleteMany({ where: { key: { startsWith: prefix } } });
  await db.$disconnect();
});
test('rate limits are shared DB state and reset after their window', async () => {
  await throttle(prefix, 2, 60);
  await throttle(prefix, 2, 60);
  await assert.rejects(() => throttle(prefix, 2, 60), /요청이 많/);
  await db.rateLimit.update({
    where: { key: prefix },
    data: { resetAt: new Date(Date.now() - 1) },
  });
  await throttle(prefix, 2, 60);
});
test('retention removes expired-event PII but preserves recent-event PII and audits purge', async () => {
  const now = Date.now();
  for (const [suffix, daysAgo] of [
    ['-old', 40],
    ['-recent', 1],
  ] as const) {
    const e = await db.event.create({
      data: {
        id: prefix + suffix,
        title: 'Retention test',
        startsAt: new Date(now - 50 * 86400000),
        endsAt: new Date(now - daysAgo * 86400000),
        retentionDays: 30,
      },
    });
    await db.participant.create({
      data: {
        eventId: e.id,
        name: '보유기간 테스트',
        department: 'QA',
        phoneEncrypted: encrypt('01010002000'),
        identityHash: identity('보유기간 테스트', '01010002000'),
      },
    });
  }
  const p = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', '--import', 'tsx', 'scripts/purge.ts'],
    { encoding: 'utf8' },
  );
  assert.equal(p.status, 0, p.stderr);
  assert.equal(await db.participant.count({ where: { eventId: prefix + '-old' } }), 0);
  assert.equal(await db.participant.count({ where: { eventId: prefix + '-recent' } }), 1);
  assert.ok(
    await db.auditLog.findFirst({ where: { target: prefix + '-old', action: 'RETENTION_PURGE' } }),
  );
});

test('configured extra participation reuses no timer and enforces maximum count', async () => {
  const { startAttempt, current, personalResult } = await import('../lib/quiz');
  const event = await db.event.create({
    data: {
      id: prefix + '-retry',
      title: 'Retry test',
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3600000),
      maxAttempts: 2,
    },
  });
  const participant = await db.participant.create({
    data: {
      eventId: event.id,
      name: '재응시 테스트',
      department: 'QA',
      phoneEncrypted: encrypt('01030004000'),
      identityHash: identity('재응시 테스트', '01030004000'),
    },
  });
  await startAttempt(participant.id);
  await db.attempt.updateMany({
    where: { participantId: participant.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await current(participant.id);
  assert.equal((await personalResult(participant.id)).canRetry, true);
  await startAttempt(participant.id);
  assert.equal(await db.attempt.count({ where: { participantId: participant.id } }), 2);
  await db.attempt.updateMany({
    where: { participantId: participant.id, status: 'ACTIVE' },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await current(participant.id);
  assert.equal((await personalResult(participant.id)).canRetry, false);
  await assert.rejects(() => startAttempt(participant.id), /이미 참여가 완료/);
});
