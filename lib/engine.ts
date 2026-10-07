import { randomInt } from 'node:crypto';
export type PoolQuestion = { id: string; difficulty: string; expectedAnswer: string };
export function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function quotas(ratios: number[], size: number) {
  const raw = ratios.map((x) => (x * size) / 100),
    q = raw.map(Math.floor);
  let left = size - q.reduce((a, b) => a + b, 0);
  const indices = raw.map((v, i) => ({ i, r: v - q[i] })).sort((a, b) => b.r - a.r);
  for (const v of indices) {
    if (left-- > 0) q[v.i]++;
  }
  return q;
}
// Joint stratification enforces difficulty and legitimate-mail quotas for each block.
export function assignPool<T extends PoolQuestion>(
  pool: T[],
  ratios: number[],
  legitimateRatio: number,
) {
  const remaining = shuffle(pool),
    result: T[] = [];
  const levels = ['EASY', 'NORMAL', 'HARD'];
  while (remaining.length) {
    const size = Math.min(10, remaining.length),
      wanted = quotas(ratios, size),
      safeWanted = quotas([legitimateRatio, 100 - legitimateRatio], size)[0];
    const buckets = levels.map((level) => [
      remaining.filter((x) => x.difficulty === level && x.expectedAnswer === 'NORMAL'),
      remaining.filter((x) => x.difficulty === level && x.expectedAnswer === 'PHISHING'),
    ]);
    let best: number[] | undefined;
    for (let a = 0; a <= wanted[0]; a++)
      for (let b = 0; b <= wanted[1]; b++) {
        const c = safeWanted - a - b;
        const ns = [a, b, c];
        if (
          ns.every(
            (n, i) =>
              n >= 0 &&
              n <= wanted[i] &&
              n <= buckets[i][0].length &&
              wanted[i] - n <= buckets[i][1].length,
          )
        ) {
          best = ns;
          break;
        }
      }
    if (!best) break;
    const block: T[] = [];
    best.forEach((n, i) =>
      block.push(...buckets[i][0].slice(0, n), ...buckets[i][1].slice(0, wanted[i] - n)),
    );
    const ids = new Set(block.map((x) => x.id));
    for (let i = remaining.length - 1; i >= 0; i--)
      if (ids.has(remaining[i].id)) remaining.splice(i, 1);
    result.push(...shuffle(block));
  }
  return result;
}
export function compareRank(
  a: { score: number; accuracy: number; correctCount: number; totalResponseMs: number; id: string },
  b: typeof a,
) {
  return (
    b.score - a.score ||
    b.accuracy - a.accuracy ||
    b.correctCount - a.correctCount ||
    a.totalResponseMs - b.totalResponseMs ||
    a.id.localeCompare(b.id)
  );
}
export function eventOpen(
  event: { active: boolean; startsAt: Date; endsAt: Date },
  now = new Date(),
) {
  if (!event.active) return '대회가 비활성화되어 있습니다.';
  if (now < event.startsAt) return '아직 대회가 시작되지 않았습니다.';
  if (now >= event.endsAt) return '대회가 종료되었습니다.';
  return null;
}
export function publicQuestion(q: Record<string, unknown>, assignmentId: string) {
  return {
    assignmentId,
    subject: q.subject,
    senderName: q.senderName,
    senderEmail: q.senderEmail,
    recipient: q.recipient,
    sentTime: q.sentTime,
    body: q.body,
    links: q.links,
    attachments: q.attachments,
    image: q.image,
  };
}
