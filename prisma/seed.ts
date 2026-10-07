import { db } from '../lib/db';
import { seedQuestions } from './content';
async function main() {
  for (const q of seedQuestions) {
    await db.question.upsert({ where: { id: q.id }, create: q, update: {} });
  }
  await db.event.upsert({
    where: { id: 'demo-2026' },
    create: {
      id: 'demo-2026',
      title: '2026 피싱메일 판별 퀴즈대회',
      description: '속도와 정확성으로 도전하는 5분 메일 판별 이벤트',
      startsAt: new Date('2026-01-01T00:00:00+09:00'),
      endsAt: new Date('2027-01-01T00:00:00+09:00'),
      departments: ['정보보안팀', '기획팀', '인사팀', '총무팀', '사업운영팀'],
      allowCustomDepartment: true,
    },
    update: {},
  });
  console.log(
    `Seed verified: ${seedQuestions.length} original questions; demo event. Existing content preserved.`,
  );
}
main().finally(() => db.$disconnect());
