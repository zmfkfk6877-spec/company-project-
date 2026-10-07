import test from 'node:test';
import assert from 'node:assert/strict';
import { assignPool, compareRank, eventOpen, publicQuestion } from '../lib/engine';
import { seedQuestions } from '../prisma/content';
import { csvCell, encrypt, decrypt, identity } from '../lib/security';
import { db } from '../lib/db';
test.after(() => db.$disconnect());
test('50 unique scenarios with 40/60 ratio and balanced 10-question blocks', () => {
  assert.equal(seedQuestions.length, 50);
  assert.equal(new Set(seedQuestions.map((q) => q.subject)).size, 50);
  assert.equal(seedQuestions.filter((q) => q.expectedAnswer === 'NORMAL').length, 20);
  for (let run = 0; run < 30; run++) {
    const assigned = assignPool(seedQuestions, [30, 40, 30], 40);
    assert.equal(assigned.length, 50);
    assert.equal(new Set(assigned.map((q) => q.id)).size, 50);
    for (let i = 0; i < 50; i += 10) {
      const block = assigned.slice(i, i + 10);
      assert.equal(block.filter((q) => q.difficulty === 'EASY').length, 3);
      assert.equal(block.filter((q) => q.difficulty === 'NORMAL').length, 4);
      assert.equal(block.filter((q) => q.difficulty === 'HARD').length, 3);
      assert.equal(block.filter((q) => q.expectedAnswer === 'NORMAL').length, 4);
    }
  }
});
test('infeasible ratios never silently weaken fairness', () =>
  assert.equal(
    assignPool(
      seedQuestions.filter((q) => q.expectedAnswer === 'PHISHING'),
      [30, 40, 30],
      40,
    ).length,
    0,
  ));
test('all rank tie breakers including deterministic exact tie', () => {
  const base = { id: 'z', score: 36, accuracy: 90, correctCount: 20, totalResponseMs: 5000 };
  assert.ok(compareRank({ ...base, score: 38 }, base) < 0);
  assert.ok(compareRank({ ...base, accuracy: 95 }, base) < 0);
  assert.ok(compareRank({ ...base, correctCount: 21 }, base) < 0);
  assert.ok(compareRank({ ...base, totalResponseMs: 4999 }, base) < 0);
  assert.ok(compareRank({ ...base, id: 'a' }, base) < 0);
});
test('public question projection never carries keys for answers or explanations', () => {
  const q = publicQuestion(seedQuestions[30], 'assigned');
  for (const key of [
    'expectedAnswer',
    'explanation',
    'risks',
    'difficulty',
    'type',
    'correct',
    'score',
    'answer',
    'phishing',
  ])
    assert.ok(!(key in q));
});
test('event boundaries including inactive status', () => {
  const now = new Date();
  assert.match(
    eventOpen({ active: true, startsAt: new Date(+now + 1), endsAt: new Date(+now + 2) }, now)!,
    /시작되지/,
  );
  assert.match(
    eventOpen({ active: true, startsAt: new Date(+now - 1), endsAt: now }, now)!,
    /종료/,
  );
});
test('authenticated encryption, normalized duplicate identity, CSV formula defense', () => {
  const ciphertext = encrypt('01012345678');
  assert.equal(decrypt(ciphertext), '01012345678');
  assert.ok(!ciphertext.includes('01012345678'));
  assert.throws(() => decrypt(ciphertext.slice(0, -2) + 'ff'));
  assert.equal(identity(' Hong ', '01012345678'), identity('hong', '01012345678'));
  assert.ok(csvCell('=HYPERLINK("x")').startsWith('"\''));
  assert.ok(csvCell(' +cmd').startsWith('"\''));
});
