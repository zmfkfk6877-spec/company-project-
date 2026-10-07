import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../app/api/[...path]/route';
import { db } from '../lib/db';
import { seedQuestions } from '../prisma/content';
import { startAttempt, current } from '../lib/quiz';
import { encrypt, identity, hash } from '../lib/security';
const prefix = 'test-' + randomBytes(6).toString('hex'),
  base = process.env.PUBLIC_URL || 'http://localhost:3000';
// Emulate the trusted reverse proxy with a unique test IP to isolate rate-limit state.
process.env.TRUST_PROXY = 'true';
let eventId = '',
  adminCookie = '',
  cookie = '',
  participantId = '',
  username = '',
  password = '';
async function request(
  url: string,
  method = 'GET',
  data?: unknown,
  cookieValue = '',
  origin = base,
) {
  const r = new NextRequest(base + '/api/' + url, {
    method,
    headers: {
      'x-real-ip': prefix,
      ...(cookieValue ? { cookie: cookieValue } : {}),
      ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}),
    },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const res = await ({ GET, POST, PATCH, DELETE } as Record<string, typeof GET>)[method](r);
  const contentType = res.headers.get('content-type') || '';
  return {
    status: res.status,
    data: contentType.includes('json') ? await res.json() : await res.text(),
    cookie: res.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
test.before(async () => {
  await db.$connect();
  for (const q of seedQuestions)
    await db.question.upsert({ where: { id: q.id }, create: q, update: {} });
  const event = await db.event.create({
    data: {
      id: prefix,
      title: 'Integration event',
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 3600000),
    },
  });
  eventId = event.id;
  username = prefix;
  password = randomBytes(16).toString('hex') + '!9';
  await db.admin.create({ data: { username, passwordHash: await bcrypt.hash(password, 12) } });
  const res = await request('admin/login', 'POST', { username, password });
  assert.equal(res.status, 200);
  adminCookie = res.cookie;
});
test.after(async () => {
  await db.event.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.admin.deleteMany({ where: { username: { startsWith: prefix } } });
  await db.question.deleteMany({ where: { subject: { startsWith: prefix } } });
  await db.auditLog.deleteMany({
    where: { OR: [{ actor: { startsWith: prefix } }, { target: { startsWith: prefix } }] },
  });
  await db.rateLimit.deleteMany({
    where: {
      OR: [
        { key: { contains: prefix } },
        {
          key: {
            in: [prefix, prefix + '-VIEWER', prefix + '-OPERATOR'].map(
              (x) => 'login-user:' + hash(x),
            ),
          },
        },
      ],
    },
  });
  await db.$disconnect();
});
test('end-to-end contest invariants and administrative operations', async (t) => {
  await t.test('unauthenticated access, CSRF and invalid login', async () => {
    assert.equal((await request('admin/questions')).status, 401);
    assert.equal(
      (await request('admin/events', 'POST', {}, adminCookie, 'https://evil.example')).status,
      403,
    );
    assert.equal(
      (await request('admin/login', 'POST', { username, password: 'wrong' })).status,
      401,
    );
    assert.ok(await db.auditLog.findFirst({ where: { actor: username, action: 'LOGIN_FAILED' } }));
  });
  await t.test('pre-start, post-end, privacy consent enforced', async () => {
    const future = await db.event.create({
      data: {
        id: prefix + '-future',
        title: 'future',
        startsAt: new Date(Date.now() + 60000),
        endsAt: new Date(Date.now() + 120000),
      },
    });
    const past = await db.event.create({
      data: {
        id: prefix + '-past',
        title: 'past',
        startsAt: new Date(Date.now() - 120000),
        endsAt: new Date(Date.now() - 60000),
      },
    });
    for (const e of [future, past])
      assert.equal(
        (
          await request('register', 'POST', {
            eventId: e.id,
            name: '테스트',
            phone: '01000000000',
            department: 'QA',
            consent: true,
          })
        ).status,
        409,
      );
    assert.equal(
      (
        await request('register', 'POST', {
          eventId,
          name: '테스트',
          phone: '01000000000',
          department: 'QA',
          consent: false,
        })
      ).status,
      400,
    );
  });
  await t.test('registration, idempotent duplicate registration and server start', async () => {
    const data = {
      eventId,
      name: '테스트 참가자',
      phone: '010-1234-5678',
      department: 'QA',
      consent: true,
    };
    const registration = await request('register', 'POST', data);
    assert.equal(registration.status, 200);
    cookie = registration.cookie;
    assert.equal((await request('register', 'POST', data)).status, 200);
    assert.equal(await db.participant.count({ where: { eventId } }), 1);
    participantId = (await db.participant.findFirstOrThrow({ where: { eventId } })).id;
    assert.equal((await request('attempt', 'GET', undefined, cookie)).data.state, 'READY');
    const start = await request('attempt/start', 'POST', {}, cookie);
    assert.equal(start.status, 200);
    assert.equal(start.data.state, 'ACTIVE');
    const a = await db.attempt.findFirstOrThrow({ where: { participantId } });
    assert.equal(+a.expiresAt - +a.startedAt, 300000);
    assert.equal(await db.assignedQuestion.count({ where: { attemptId: a.id } }), 50);
    const text = JSON.stringify(start.data);
    for (const k of [
      'expectedAnswer',
      'correctCount',
      'wrongCount',
      'explanation',
      'score',
      'phishing',
      'difficulty',
    ])
      assert.ok(!text.includes('"' + k + '"'));
  });
  await t.test(
    'foreign valid assignment and other participant result IDs cannot cross sessions',
    async () => {
      const second = await request('register', 'POST', {
        eventId,
        name: '다른 세션',
        phone: '01077776666',
        department: 'QA',
        consent: true,
      });
      assert.equal(second.status, 200);
      const p = await request('attempt/start', 'POST', {}, second.cookie);
      assert.equal(p.status, 200);
      assert.equal(
        (
          await request(
            'attempt/answer',
            'POST',
            { assignmentId: p.data.question.assignmentId, selectedAnswer: 'NORMAL' },
            cookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (await request('result?participantId=' + participantId, 'GET', undefined, second.cookie))
          .status,
        409,
      );
    },
  );
  await t.test('event CRUD validates ratios and chronology', async () => {
    const input = {
      title: 'Test event',
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 100000).toISOString(),
    };
    assert.equal(
      (await request('admin/events', 'POST', { ...input, easyRatio: 20 }, adminCookie)).status,
      400,
    );
    assert.equal(
      (await request('admin/events', 'POST', { ...input, endsAt: input.startsAt }, adminCookie))
        .status,
      400,
    );
    const created = await request('admin/events', 'POST', input, adminCookie);
    assert.equal(created.status, 201);
    assert.equal(
      (
        await request(
          'admin/events/' + created.data.id,
          'PATCH',
          { ...input, title: 'Updated event' },
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('admin/events/' + created.data.id, 'DELETE', undefined, adminCookie)).status,
      200,
    );
  });
  await t.test(
    'refresh/reconnect preserves deadline and unauthorized assignment rejected',
    async () => {
      const a = await request('attempt', 'GET', undefined, cookie),
        b = await request('attempt/start', 'POST', {}, cookie);
      assert.equal(a.data.expiresAt, b.data.expiresAt);
      assert.equal(a.data.question.assignmentId, b.data.question.assignmentId);
      assert.equal(
        (
          await request(
            'attempt/answer',
            'POST',
            { assignmentId: 'not-assigned', selectedAnswer: 'NORMAL' },
            cookie,
          )
        ).status,
        409,
      );
      assert.equal((await request('result/other-id', 'GET', undefined, cookie)).status, 404);
      assert.equal((await request('result', 'GET', undefined, cookie)).status, 409);
      assert.equal((await request('review', 'GET', undefined, cookie)).status, 409);
    },
  );
  await t.test('concurrent duplicate submission scores once and hides correctness', async () => {
    const p = (await request('attempt', 'GET', undefined, cookie)).data;
    const a = await db.assignedQuestion.findUniqueOrThrow({
      where: { id: p.question.assignmentId },
    });
    const expected = (a.snapshot as Record<string, unknown>).expectedAnswer;
    const payload = { assignmentId: a.id, selectedAnswer: expected };
    const [one, two] = await Promise.all([
      request('attempt/answer', 'POST', payload, cookie),
      request('attempt/answer', 'POST', payload, cookie),
    ]);
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    assert.equal(one.data.answeredCount, 1);
    assert.equal(two.data.answeredCount, 1);
    assert.equal(await db.answer.count({ where: { assignedId: a.id } }), 1);
    const saved = await db.attempt.findFirstOrThrow({ where: { participantId } });
    assert.equal(saved.score, 2);
    for (const x of [one, two])
      for (const k of ['correct', 'incorrect', 'answer', 'expectedAnswer', 'score', 'phishing'])
        assert.ok(!JSON.stringify(x.data).includes('"' + k + '"'));
  });
  await t.test('wrong answer decreases score, unshown question rejected', async () => {
    const p = (await request('attempt', 'GET', undefined, cookie)).data;
    const a = await db.assignedQuestion.findUniqueOrThrow({
      where: { id: p.question.assignmentId },
    });
    const other = await db.assignedQuestion.findFirstOrThrow({
      where: { attemptId: a.attemptId, position: 10 },
    });
    assert.equal(
      (
        await request(
          'attempt/answer',
          'POST',
          { assignmentId: other.id, selectedAnswer: 'NORMAL' },
          cookie,
        )
      ).status,
      409,
    );
    const expected = (a.snapshot as Record<string, unknown>).expectedAnswer;
    await request(
      'attempt/answer',
      'POST',
      { assignmentId: a.id, selectedAnswer: expected === 'NORMAL' ? 'PHISHING' : 'NORMAL' },
      cookie,
    );
    const saved = await db.attempt.findFirstOrThrow({ where: { participantId } });
    assert.equal(saved.score, 0);
    assert.equal(saved.correctCount, 1);
    assert.equal(saved.wrongCount, 1);
  });
  await t.test('timeout forbids answers, completion blocks duplicate participation', async () => {
    await db.attempt.updateMany({
      where: { participantId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = await request(
      'attempt/answer',
      'POST',
      { assignmentId: 'anything', selectedAnswer: 'NORMAL' },
      cookie,
    );
    assert.equal(expired.data.state, 'FINISHED');
    assert.equal(await db.answer.count({ where: { attempt: { participantId } } }), 2);
    const result = await request('result', 'GET', undefined, cookie);
    assert.equal(result.status, 200);
    assert.equal(result.data.score, 0);
    assert.equal(result.data.accuracy, 50);
    for (const k of ['name', 'phone', 'department', 'participantId'])
      assert.ok(!(k in result.data));
    assert.equal(
      (
        await request('register', 'POST', {
          eventId,
          name: '테스트 참가자',
          phone: '01012345678',
          department: 'QA',
          consent: true,
        })
      ).status,
      409,
    );
    assert.equal((await request('review', 'GET', undefined, cookie)).status, 403);
  });
  await t.test('ranking tie-breaker is reflected in API, masked results and CSV', async () => {
    const p = await db.participant.create({
      data: {
        eventId,
        name: '다른 참가자',
        department: 'QA',
        phoneEncrypted: encrypt('01099998888'),
        identityHash: identity('다른 참가자', '01099998888'),
      },
    });
    await db.attempt.create({
      data: {
        participantId: p.id,
        eventId,
        startedAt: new Date(Date.now() - 300000),
        expiresAt: new Date(),
        finishedAt: new Date(),
        status: 'FINISHED',
        correctPoints: 2,
        wrongPoints: -2,
        score: 0,
        accuracy: 60,
        correctCount: 1,
        wrongCount: 1,
        answeredCount: 2,
        totalResponseMs: 1,
      },
    });
    const result = (await request('result', 'GET', undefined, cookie)).data;
    assert.equal(result.rank, 2);
    assert.equal(result.participantCount, 2);
    const rows = (await request(`admin/events/${eventId}/results`, 'GET', undefined, adminCookie))
      .data;
    assert.ok(rows.every((x: { phone: string }) => x.phone.includes('**')));
    assert.equal(rows[0].name, '다른 참가자');
    const searched = (
      await request(
        `admin/events/${eventId}/results?search=99998888`,
        'GET',
        undefined,
        adminCookie,
      )
    ).data;
    assert.equal(searched.length, 1);
    assert.ok(searched[0].phone.includes('**'));
    const csv = await request(`admin/events/${eventId}/export`, 'GET', undefined, adminCookie);
    assert.equal(csv.status, 200);
    assert.ok(csv.data.includes('01012345678'));
    assert.ok(
      await db.auditLog.findFirst({ where: { actor: username, action: 'RESULT_DOWNLOAD' } }),
    );
  });
  await t.test('question CRUD, copy, frozen snapshots', async () => {
    const existing = await db.assignedQuestion.findFirstOrThrow({
      where: { attempt: { participantId } },
    });
    const before = JSON.stringify(existing.snapshot);
    const data = { ...seedQuestions[0], subject: prefix + ' question' };
    const created = await request('admin/questions', 'POST', data, adminCookie);
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.equal(
      (
        await request(
          'admin/questions/' + id,
          'PATCH',
          { ...data, subject: prefix + ' edited' },
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('admin/questions/' + id + '/copy', 'POST', {}, adminCookie)).status,
      201,
    );
    assert.equal(
      (await request('admin/questions/' + id, 'DELETE', undefined, adminCookie)).status,
      200,
    );
    assert.equal(
      JSON.stringify(
        (await db.assignedQuestion.findUniqueOrThrow({ where: { id: existing.id } })).snapshot,
      ),
      before,
    );
  });
  await t.test('explanations only after event ended and released, final rank', async () => {
    await db.event.update({
      where: { id: eventId },
      data: { endsAt: new Date(Date.now() - 1), explanationsPublished: true },
    });
    assert.equal((await request('result', 'GET', undefined, cookie)).data.rankStatus, 'FINAL');
    const review = await request('review', 'GET', undefined, cookie);
    assert.equal(review.status, 200);
    assert.equal(review.data.length, 2);
    assert.ok(review.data[0].explanation);
  });
  await t.test('VIEWER cannot mutate or export, OPERATOR cannot delete private data', async () => {
    for (const role of ['VIEWER', 'OPERATOR']) {
      const a = await db.admin.create({
        data: {
          username: prefix + '-' + role,
          passwordHash: await bcrypt.hash(password, 12),
          role,
        },
      });
      const login = await request('admin/login', 'POST', { username: a.username, password });
      const c = login.cookie;
      assert.equal(
        (await request(`admin/events/${eventId}/export`, 'GET', undefined, c)).status,
        403,
      );
      assert.equal(
        (await request('admin/participants/' + participantId, 'DELETE', undefined, c)).status,
        403,
      );
      if (role === 'VIEWER')
        assert.equal((await request('admin/questions', 'POST', seedQuestions[0], c)).status, 403);
    }
  });
  await t.test('reset and privacy deletion revoke sessions and cascade answers', async () => {
    assert.equal(
      (await request('admin/participants/' + participantId + '/reset', 'POST', {}, adminCookie))
        .status,
      200,
    );
    assert.equal(await db.attempt.count({ where: { participantId } }), 0);
    assert.equal((await request('attempt', 'GET', undefined, cookie)).status, 401);
    assert.equal(
      (await request('admin/participants/' + participantId, 'DELETE', undefined, adminCookie))
        .status,
      200,
    );
    assert.equal(await db.participant.count({ where: { id: participantId } }), 0);
  });
});
test('100 concurrent participants restore independent attempts without state leakage', async () => {
  const e = await db.event.create({
    data: {
      id: prefix + '-load',
      title: 'load',
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 3600000),
    },
  });
  const ids: string[] = [];
  for (let i = 0; i < 100; i++) {
    const p = await db.participant.create({
      data: {
        eventId: e.id,
        name: 'Load ' + i,
        department: 'QA',
        phoneEncrypted: encrypt('010' + String(i).padStart(8, '0')),
        identityHash: identity('Load ' + i, '010' + String(i).padStart(8, '0')),
      },
    });
    ids.push(p.id);
  }
  const start = performance.now();
  const started = await Promise.all(ids.map((id) => startAttempt(id)));
  assert.ok(started.every((x) => x.state === 'ACTIVE'));
  const restored = await Promise.all(ids.map((id) => current(id)));
  assert.equal(
    new Set(restored.map((x) => ('question' in x ? x.question?.assignmentId : undefined))).size,
    100,
  );
  console.log(`100 simultaneous starts + 100 restores: ${Math.round(performance.now() - start)}ms`);
});
