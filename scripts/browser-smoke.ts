import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
async function main() {
  const base = process.env.PUBLIC_URL || 'http://localhost:3000';
  const tag = 'browser-' + randomBytes(5).toString('hex');
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const errors: string[] = [];
  const participantContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await participantContext.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: /대회 참가하기/ }).waitFor();
    await page.screenshot({ path: '/tmp/phishing-quiz-home.png', fullPage: true });
    await page.getByRole('button', { name: /대회 참가하기/ }).click();
    await page.locator('select[name=department]').selectOption('__custom');
    await page.getByLabel('부서 직접 입력').fill('브라우저검증팀');
    await page.getByLabel('이름', { exact: true }).fill(tag);
    await page.getByLabel('휴대전화번호').fill('01087654321');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /대회 안내 확인/ }).click();
    await page.getByRole('button', { name: /START/ }).waitFor();
    await page.getByRole('button', { name: /START/ }).click();
    await page.getByRole('button', { name: '정상 메일', exact: false }).waitFor();
    const p = await db.participant.findFirstOrThrow({ where: { name: tag } });
    assert.equal(p.department, '브라우저검증팀');
    const attempt = await db.attempt.findFirstOrThrow({ where: { participantId: p.id } });
    assert.equal(+attempt.expiresAt - +attempt.startedAt, 300000);
    await page.screenshot({ path: '/tmp/phishing-quiz-mail.png', fullPage: true });
    const response = await page.request.get(base + '/api/attempt');
    const data = await response.json();
    assert.ok(data.question.senderEmail);
    assert.ok(!('expectedAnswer' in data.question));
    await page.locator('.mail-meta .inspect-button').click();
    await page.locator('.mail-meta .inspect-detail').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '정상 메일', exact: false }).click();
    await page.waitForFunction(
      () => document.querySelector('.answer-count strong')?.textContent === '1',
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('.answer-count strong')?.textContent === '1',
    );
    assert.equal(
      +(await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).expiresAt,
      +attempt.expiresAt,
    );
    const context = page.context();
    await page.close();
    const reopened = await context.newPage();
    reopened.on('pageerror', (e) => errors.push(e.message));
    await reopened.goto(base);
    await reopened.waitForFunction(
      () => document.querySelector('.answer-count strong')?.textContent === '1',
    );
    await db.attempt.update({
      where: { id: attempt.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await reopened.reload();
    await reopened.getByText('관찰의 시간이 끝났습니다.').waitFor();
    await reopened.screenshot({ path: '/tmp/phishing-quiz-result.png', fullPage: true });
    assert.ok(await reopened.getByText(/나의 현재 순위/).isVisible());
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    admin.on('pageerror', (e) => errors.push(e.message));
    await admin.goto(base + '/admin');
    await admin.getByLabel('아이디').fill(process.env.ADMIN_USERNAME!);
    await admin.getByLabel('비밀번호', { exact: true }).fill(process.env.ADMIN_INITIAL_PASSWORD!);
    await admin.getByRole('button', { name: '로그인 →' }).click();
    await admin.getByRole('heading', { name: 'Dashboard' }).waitFor();
    await admin.screenshot({ path: '/tmp/phishing-quiz-admin.png', fullPage: true });
    await admin.getByRole('button', { name: '문제은행' }).click();
    await admin.getByRole('button', { name: '미리보기', exact: true }).first().waitFor();
    assert.equal(await admin.locator('tbody tr').count(), 50);
    await admin.getByRole('button', { name: '미리보기', exact: true }).first().click();
    await admin.getByRole('dialog').waitFor();
    await admin.getByRole('button', { name: /미리보기 닫기/ }).click();
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    mobile.on('pageerror', (e) => errors.push(e.message));
    await mobile.goto(base);
    await mobile.getByRole('button', { name: /대회 참가하기/ }).waitFor();
    await mobile.screenshot({ path: '/tmp/phishing-quiz-mobile.png', fullPage: true });
    assert.ok(
      await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    );
    assert.deepEqual(errors, []);
    console.log(
      'Browser smoke passed: home, consent, custom department, countdown, one answer, refresh, reopen, timeout, result, admin login/bank/preview, mobile overflow.',
    );
  } finally {
    try {
      await db.participant.deleteMany({ where: { name: tag } });
    } finally {
      await browser.close();
      await db.$disconnect();
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
