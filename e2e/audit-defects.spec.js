import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../dwnc-app/server.js';
import { koreaToday } from '../dwnc-app/clock.js';

let application, directory;
const origin = 'http://127.0.0.1:4187';
const password = 'Audit-fictional-only-482!';
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'dwnc-defect-browser-'));
  application = await createApplication({ databasePath: path.join(directory, 'test.sqlite'), baseURL: origin, production: false });
  await new Promise(resolve => application.server.listen(4187, '127.0.0.1', resolve));
});
test.beforeEach(() => application.db.exec('DELETE FROM rateLimit'));
test.afterAll(async () => {
  if (application) await application.close();
  if (directory) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});

async function signup(page, name, email, custom = false) {
  await page.goto('/');
  await page.getByRole('button', { name: '처음이에요 · 회원가입' }).click();
  await page.locator('#auth-form [name="name"]').fill(name);
  await page.locator('#auth-form [name="region"]').fill(custom ? '마포구' : '관악구');
  if (custom) {
    await page.locator('#auth-form [name="ageRange"]').selectOption('30대');
    await page.locator('#auth-form .pick-chip').filter({ hasText: '테니스' }).click();
    await page.locator('#auth-form .pick-chip').filter({ hasText: '풋살' }).click();
  }
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.locator('[name="confirmPassword"]').fill(password);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}
async function snapshot(page) { return (await (await page.request.get('/api/state')).json()); }
async function command(page, type, payload) {
  const current = await snapshot(page);
  const response = await page.request.post('/api/commands', {
    headers: { Origin: origin },
    data: { type, payload, revision: current.revision, expectedUserId: current.state.activeUserId, requestId: randomUUID() },
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function rejectCommand(page, type) {
  await page.route('**/api/commands', async intercepted => {
    if (intercepted.request().postDataJSON().type === type) await intercepted.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '허구 테스트 저장 오류', code: 'TEST_UNAVAILABLE' }) });
    else await intercepted.continue();
  });
}

test('failed group save retains draft, traps keyboard and allows exactly one retry', async ({ page }) => {
  await signup(page, '모달 오류 QA', 'defect-modal@example.test');
  await page.goto('/#/community?tab=groups');
  await page.getByRole('button', { name: '그룹 만들기' }).click();
  await page.locator('#group-form [name="name"]').fill('실패 후 보존되는 그룹');
  await page.locator('#group-form [name="description"]').fill('입력 보존 확인');
  await rejectCommand(page, 'group.create');
  await page.locator('#group-form button[type="submit"]').click();
  await expect(page.locator('.toast.error')).toBeVisible();
  await expect(page.locator('#group-form [name="name"]')).toHaveValue('실패 후 보존되는 그룹');
  await page.locator('#group-form button[type="submit"]').press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.getByRole('button', { name: '그룹 만들기' }).click();
  await expect(page.locator('#group-form [name="name"]')).toHaveValue('실패 후 보존되는 그룹');
  await page.unroute('**/api/commands');
  await page.locator('#group-form button[type="submit"]').click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  expect((await snapshot(page)).state.groups.filter(group => group.name === '실패 후 보존되는 그룹')).toHaveLength(1);
});

test('failed result proposal keeps dialog and draft while host-only retry confirms once', async ({ page }) => {
  await signup(page, '결과 오류 QA', 'defect-result@example.test');
  const created = await command(page, 'match.create', { sport: 'running', format: 'crew', visibility: 'public', title: '결과 재시도', region: '관악구', venue: '허구 공원', date: koreaToday(), startTime: '00:00', endTime: '23:59', capacity: 4, level: '입문', description: '격리된 검증' });
  await page.goto(`/#/home?match=${created.id}`);
  await page.reload();
  await page.locator('[role="dialog"] [data-action="result"]').click();
  const distance = page.locator('#result-form input[name^="distance-"]');
  await distance.fill('7');
  await rejectCommand(page, 'result.save');
  await page.locator('#result-form button[type="submit"]').click();
  await expect(page.locator('.toast.error')).toBeVisible();
  await expect(distance).toHaveValue('7');
  const failed = await snapshot(page);
  expect(failed.state.results.filter(result => result.matchId === created.id)).toHaveLength(0);
  expect(failed.state.resultProposals.filter(proposal => proposal.matchId === created.id)).toHaveLength(0);
  await page.locator('#result-form button[type="submit"]').press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  // Escape returns to the parent details dialog, preserving modal history.
  await expect(page.locator('#result-form')).toHaveCount(0);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await expect(page.locator('[role="dialog"]')).toContainText('결과 재시도');
  await page.locator('[role="dialog"] [data-action="result"]').click();
  await expect(distance).toHaveValue('7');
  await page.unroute('**/api/commands');
  await page.locator('#result-form button[type="submit"]').click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const current = await snapshot(page);
  const result = current.state.results.find(result => result.matchId === created.id);
  expect(result.entries[current.state.activeUserId].distanceKm).toBe(7);
  expect(current.state.results.filter(result => result.matchId === created.id)).toHaveLength(1);
  const proposals = current.state.resultProposals.filter(proposal => proposal.matchId === created.id);
  expect(proposals).toHaveLength(1);
  expect(proposals[0].status).toBe('confirmed');
  expect(proposals[0].participantIds).toEqual([current.state.activeUserId]);
  // Proposals preserve submitted form values; canonical results normalize numbers.
  expect(proposals[0].data.entries[current.state.activeUserId].distanceKm).toBe('7');
});

test('signup profile failure preserves password-free setup and retries the existing account', async ({ page }) => {
  let signups = 0;
  page.on('request', request => { if (request.url().endsWith('/api/auth/sign-up/email')) signups++; });
  await rejectCommand(page, 'profile.update');
  await signup(page, '가입 복구 QA', 'defect-signup@example.test', true);
  await expect(page.locator('.toast.error')).toBeVisible();
  await expect(page.locator('[type="password"]')).toHaveCount(0);
  const retry = page.getByRole('button', { name: '가입 정보 다시 저장' });
  await expect(retry).toBeVisible();
  const recovery = page.locator('.signup-recovery');
  await expect(recovery).toContainText('마포구');
  await expect(recovery).toContainText('30대');
  await expect(recovery).toContainText('러닝');
  const ownerId = (await snapshot(page)).state.activeUserId;
  const stored = await page.evaluate(() => sessionStorage.getItem('dwnc.signup-recovery.v1'));
  expect(stored).not.toContain(password);
  expect(stored).not.toContain('defect-signup@example.test');
  await page.reload();
  await expect(retry).toBeVisible();
  await expect(recovery).toContainText('마포구');
  await expect(recovery).toContainText('30대');
  await expect(recovery).toContainText('러닝');
  expect((await snapshot(page)).state.activeUserId).toBe(ownerId);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(retry).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `audit-evidence/signup-recovery-${width}.png` });
  }
  await page.unroute('**/api/commands');
  await retry.click();
  await expect(retry).toHaveCount(0);
  const current = await snapshot(page), user = current.state.users.find(user => user.id === current.state.activeUserId);
  expect(user.region).toBe('마포구'); expect(user.ageRange).toBe('30대'); expect(user.chosenSports).toEqual(['running']);
  expect(signups).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('dwnc.signup-recovery.v1'))).toBeNull();
});

test('signup completion retry detects a shared-cookie account change without overwriting it', async ({ page, context }) => {
  await rejectCommand(page, 'profile.update');
  await signup(page, '이전 가입 QA', 'defect-signup-old@example.test', true);
  const retry = page.getByRole('button', { name: '가입 정보 다시 저장' });
  await expect(retry).toBeVisible();
  const other = await context.newPage();
  const signedUp = await other.request.post('/api/auth/sign-up/email', { headers: { Origin: origin }, data: { name: '변경 계정 QA', email: 'defect-signup-other@example.test', password } });
  expect(signedUp.status()).toBe(200);
  const otherCurrent = await snapshot(other), otherId = otherCurrent.state.activeUserId;
  await page.unroute('**/api/commands');
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.locator('.top .who__name')).toHaveText('변경 계정 QA');
  const updated = await snapshot(other), otherUser = updated.state.users.find(user => user.id === otherId);
  expect(otherUser.region).toBe('미설정'); expect(otherUser.ageRange).toBe('미입력');
  await other.close();
});

test('saving a newer profile discards obsolete signup completion fields', async ({ page }) => {
  await rejectCommand(page, 'profile.update');
  await signup(page, '가입 수정 QA', 'defect-signup-edit@example.test', true);
  const retry = page.getByRole('button', { name: '가입 정보 다시 저장' });
  await expect(retry).toBeVisible();
  await page.unroute('**/api/commands');
  await page.locator('[data-action="toggle-edit"]').click();
  await page.locator('#profile-form [name="region"]').fill('서초구');
  await page.locator('#profile-form button[type="submit"]').click();
  await expect(page.locator('#profile-form')).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  const current = await snapshot(page);
  expect(current.state.users.find(user => user.id === current.state.activeUserId).region).toBe('서초구');
});
