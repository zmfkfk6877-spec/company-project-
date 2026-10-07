import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
const base = process.argv[2] || process.env.PUBLIC_URL || 'http://localhost:3000';
const tag = 'http-' + randomBytes(5).toString('hex');
let participantCookie = '',
  adminCookie = '',
  participantId = '';
async function call(route, method = 'GET', data, cookie = '') {
  const res = await fetch(base + '/api/' + route, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== 'GET' ? { Origin: base } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return {
    status: res.status,
    data: (res.headers.get('content-type') || '').includes('json')
      ? await res.json()
      : await res.text(),
    cookie: res.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
try {
  for (const route of ['/', '/admin']) assert.equal((await fetch(base + route)).status, 200);
  assert.ok((await call('events')).data.some((e) => e.id === 'demo-2026'));
  const login = await call('admin/login', 'POST', {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_INITIAL_PASSWORD,
  });
  assert.equal(login.status, 200);
  adminCookie = login.cookie;
  const registration = await call('register', 'POST', {
    eventId: 'demo-2026',
    name: tag,
    department: 'HTTP QA',
    phone: '01055559999',
    consent: true,
  });
  assert.equal(registration.status, 200);
  participantCookie = registration.cookie;
  let progress = (await call('attempt/start', 'POST', {}, participantCookie)).data;
  let count = 0;
  while (progress.state === 'ACTIVE') {
    for (const key of [
      'correct',
      'incorrect',
      'answer',
      'expectedAnswer',
      'phishing',
      'score',
      'explanation',
    ])
      assert.ok(!JSON.stringify(progress).includes('"' + key + '":'));
    progress = (
      await call(
        'attempt/answer',
        'POST',
        { assignmentId: progress.question.assignmentId, selectedAnswer: 'NORMAL' },
        participantCookie,
      )
    ).data;
    if (++count > 60) throw Error('Unexpected repeated question');
  }
  assert.equal(progress.state, 'FINISHED');
  const result = (await call('result', 'GET', undefined, participantCookie)).data;
  assert.equal(result.answeredCount, 50);
  assert.equal(result.correctCount, 20);
  assert.equal(result.wrongCount, 30);
  assert.equal(result.score, -20);
  const rows = (await call('admin/events/demo-2026/results', 'GET', undefined, adminCookie)).data;
  const mine = rows.find((r) => r.name === tag);
  assert.ok(mine.phone.includes('**'));
  participantId = mine.participantId;
  const csv = await call('admin/events/demo-2026/export', 'GET', undefined, adminCookie);
  assert.equal(csv.status, 200);
  assert.ok(csv.data.includes(tag));
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#187b69' } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set('file', new Blob([image], { type: 'image/png' }), 'training.png');
  const uploaded = await fetch(base + '/api/admin/upload', {
    method: 'POST',
    headers: { Origin: base, Cookie: adminCookie },
    body: form,
  });
  assert.equal(uploaded.status, 200);
  const asset = (await uploaded.json()).image;
  assert.equal((await fetch(base + asset, { headers: { Cookie: participantCookie } })).status, 200);
  assert.equal((await fetch(base + asset)).status, 401);
  const malicious = new FormData();
  malicious.set(
    'file',
    new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }),
    'bad.svg',
  );
  assert.equal(
    (
      await fetch(base + '/api/admin/upload', {
        method: 'POST',
        headers: { Origin: base, Cookie: adminCookie },
        body: malicious,
      })
    ).status,
    400,
  );
  console.log(
    'HTTP smoke passed: HTML, event list, admin auth, registration, 50 answers, protected answers, final scoring, masked results, CSV, authenticated image upload, SVG rejection.',
  );
} finally {
  if (adminCookie) {
    if (!participantId) {
      const rows = (
        await call('admin/events/demo-2026/participants', 'GET', undefined, adminCookie)
      ).data;
      participantId = Array.isArray(rows) ? rows.find((p) => p.name === tag)?.id : '';
    }
    if (participantId)
      await call('admin/participants/' + participantId, 'DELETE', undefined, adminCookie);
    await call('admin/logout', 'POST', {}, adminCookie);
  }
}
