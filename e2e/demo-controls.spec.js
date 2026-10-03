import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../dwnc-app/server.js';
import { ensureProfile } from '../backend/commands.js';
import { koreaToday } from '../dwnc-app/clock.js';

const origin = 'http://127.0.0.1:42984';
const password = 'Demo-fictional-only-583!';
let application, directory, owner, peer, previousAllowlist;
test.use({ baseURL: origin });
test.beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'dwnc-demo-e2e-'));
  application = await createApplication({ databasePath: path.join(directory, 'test.sqlite'), baseURL: origin, production: false });
  for (const name of ['시연 소유자', '운동 친구']) {
    const email = `${randomUUID()}@example.test`;
    const account = await application.auth.api.signUpEmail({ body: { name, email, password } });
    ensureProfile(application.db, account.user);
    if (!owner) owner = { ...account.user, email }; else peer = { ...account.user, email };
  }
  previousAllowlist = process.env.DEMO_USER_IDS;
  process.env.DEMO_USER_IDS = owner.id;
  await new Promise(resolve => application.server.listen(42984, '127.0.0.1', resolve));
});
test.afterEach(async () => {
  if (previousAllowlist === undefined) delete process.env.DEMO_USER_IDS; else process.env.DEMO_USER_IDS = previousAllowlist;
  if (application) await application.close();
  if (directory) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe demo fixture cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
  owner = null; peer = null;
});

async function login(page, account) {
  const response = await page.request.post('/api/auth/sign-in/email', { headers: { Origin: origin }, data: { email: account.email, password } });
  expect(response.status()).toBe(200);
  await page.goto('/#/home');
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}
async function snapshot(page) {
  const response = await page.request.get('/api/state');
  expect(response.status()).toBe(200);
  return response.json();
}
async function command(page, type, payload) {
  const { state, revision } = await snapshot(page);
  const response = await page.request.post('/api/commands', { headers: { Origin: origin }, data: { type, payload, revision, expectedUserId: state.activeUserId, requestId: randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function baselineRun(page, title) {
  const made = await command(page, 'match.create', { sport: 'running', format: 'crew', visibility: 'public', title, region: '관악구', venue: '허구 기존 공원', date: koreaToday(), startTime: '00:00', endTime: '23:59', capacity: 2, level: '입문', description: '시연 초기화가 보존할 일반 기록' });
  const id = (await snapshot(page)).state.activeUserId;
  await command(page, 'result.save', { matchId: made.id, data: { attendedIds: [id], entries: { [id]: { distanceKm: 5, paceSec: 340 } } } });
  return made.id;
}
async function expectStats(card, total, distance) {
  await expect(card.locator('.kong-profile')).toHaveAttribute('data-total', String(total));
  await expect(card.locator('[data-home-sport="running"] dd')).toHaveText(`${distance}km`);
  await expect(card.locator('[data-home-sport="tennis"]')).toContainText('TENNIS');
  await expect(card.locator('[data-home-sport="futsal"]')).toContainText('FUTSAL');
}
async function flip(card, expected) {
  const button = card.locator('.passport-flip-btn');
  await expect(button).toHaveText(expected ? '콩 성장 보기' : '신분증 보기');
  await button.focus(); await button.press('Enter');
  await expect(card.locator('.passport-flip')).toHaveAttribute('data-flipped', String(expected));
  await expect(button).toBeFocused();
  await expect(button).toHaveText(expected ? '신분증 보기' : '콩 성장 보기');
  await expect.poll(() => card.locator('.passport-rotor').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m11)).toBeCloseTo(expected ? -1 : 1, 3);
  expect(await card.locator('.passport-front').evaluate(node => node.inert)).toBe(expected);
  expect(await card.locator('.passport-back').evaluate(node => node.inert)).toBe(!expected);
}
async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].map(node => ({ node: `${node.tagName}.${node.className}`, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })).filter(rect => rect.left < -1 || rect.right > innerWidth + 1).slice(0, 20) }));
  expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.width);
}

test('allowed demo add retries one UUID, persists 11 records and reset retains the one ordinary record', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page, owner);
  expect((await snapshot(page)).state.results).toHaveLength(0);
  const baselineId = await baselineRun(page, '보존할 기존 러닝');
  await command(page, 'note.save', { date: koreaToday(), text: '시연 초기화 후에도 보존' });
  const before = await snapshot(page), original = before.state.results.find(result => result.matchId === baselineId);
  await page.reload();
  const card = page.locator('.content .passport-card');
  await expectStats(card, 1, 5);
  await expect(card.locator('.kong-profile')).toHaveAttribute('data-stage', '0');
  const envelopes = [];
  await page.route('**/api/demo/records', async intercepted => {
    const body = intercepted.request().postDataJSON();
    envelopes.push(body);
    if (envelopes.length === 1) {
      const committed = await intercepted.fetch();
      expect(committed.status()).toBe(200);
      await intercepted.abort('failed');
    } else await intercepted.continue();
  });
  const replayResponse = page.waitForResponse(response => response.url().endsWith('/api/demo/records') && response.status() === 200);
  await card.getByRole('button', { name: '운동 10회 추가', exact: true }).click();
  expect((await (await replayResponse).json()).replayed).toBe(true);
  await expectStats(card, 11, 55);
  await expect(card.locator('.kong-profile')).toHaveAttribute('data-stage', '1');
  expect(envelopes).toHaveLength(2);
  expect(envelopes[1]).toEqual(envelopes[0]);
  expect(envelopes[0].requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await page.unroute('**/api/demo/records');
  for (let reload = 0; reload < 2; reload++) {
    await page.reload(); await expectStats(card, 11, 55);
    const current = await snapshot(page);
    expect(current.state.results).toHaveLength(11);
    expect(current.state.matches.filter(match => match.demoGeneratedOwnerId === owner.id)).toHaveLength(10);
    expect(current.state.results.find(result => result.matchId === baselineId)).toEqual(original);
  }
  await card.getByRole('button', { name: '시연 기록 초기화', exact: true }).click();
  await expectStats(card, 1, 5);
  await expect(card.locator('.kong-profile')).toHaveAttribute('data-stage', '0');
  await page.reload(); await expectStats(card, 1, 5);
  const reset = await snapshot(page);
  expect(reset.state.results).toEqual([original]);
  expect(reset.state.matches.some(match => match.id === baselineId)).toBe(true);
  expect(reset.state.matches.some(match => match.demoGeneratedOwnerId === owner.id)).toBe(false);
  expect(reset.state.dailyNotes[owner.id][koreaToday()]).toBe('시연 초기화 후에도 보존');
  expect(reset.state.users).toEqual(before.state.users);
  // A delayed replay of the already acknowledged add cannot resurrect fixtures after reset.
  const replay = await page.request.post('/api/demo/records', { headers: { Origin: origin }, data: envelopes[0] });
  expect(replay.status()).toBe(200); expect((await replay.json()).replayed).toBe(true);
  expect((await snapshot(page)).state.results).toEqual([original]);
  expect(errors).toEqual([]);
});

test('ordinary account has no demo buttons and the authenticated endpoint rejects both actions', async ({ page }) => {
  await login(page, peer);
  await expect(page.locator('[data-action="demo-add-records"], [data-action="demo-reset-records"]')).toHaveCount(0);
  const before = await snapshot(page);
  expect(before.demoControls).toBeUndefined();
  for (const action of ['add10', 'reset']) {
    const response = await page.request.post('/api/demo/records', { headers: { Origin: origin }, data: { action, requestId: randomUUID(), expectedUserId: peer.id } });
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('DEMO_FORBIDDEN');
  }
  const after = await snapshot(page);
  expect(after.revision).toBe(before.revision); expect(after.state.results).toEqual(before.state.results);
});

test('owner and friend keep the new statistics card, keyboard flip and mobile canvas at 320, 390 and 1280px', async ({ browser, page }) => {
  test.setTimeout(90000);
  const peerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const peerPage = await peerContext.newPage();
    await login(page, owner); await login(peerPage, peer);
    await baselineRun(page, '소유자 일반 기록'); await baselineRun(peerPage, '친구 일반 기록');
    const peerProfile = (await snapshot(peerPage)).state.users.find(person => person.id === peer.id);
    await command(page, 'friend.request', { code: peerProfile.friendCode });
    const request = (await snapshot(peerPage)).state.friendRequests.find(item => item.fromId === owner.id && item.status === 'pending');
    await command(peerPage, 'friend.decide', { requestId: request.id, decision: 'accepted' });
    await page.reload();
    const ownerCard = page.locator('.content .passport-card');
    await expect(ownerCard).toHaveAttribute('data-home-owner', 'true');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expectStats(ownerCard, 1, 5); await noOverflow(page);
      await page.screenshot({ path: `evidence/owner-front-${width}.png`, fullPage: true });
      await flip(ownerCard, true); await noOverflow(page);
      await page.screenshot({ path: `evidence/owner-kong-${width}.png`, fullPage: true });
      await flip(ownerCard, false);
    }
    await page.goto('/#/community?tab=friends');
    await page.locator(`.content .row[data-action="view-profile"][data-id="${peer.id}"]`).click();
    const friendCard = page.locator('.sheet .passport-card');
    await expect(friendCard).toHaveAttribute('data-home-owner', 'false');
    await expect(friendCard.locator('[data-action="demo-add-records"], [data-action="demo-reset-records"]')).toHaveCount(0);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expectStats(friendCard, 1, 5); await noOverflow(page);
      await page.screenshot({ path: `evidence/friend-front-${width}.png`, fullPage: true });
      await flip(friendCard, true); await noOverflow(page);
      await expect(friendCard.locator('.kong-cta')).toHaveCount(0);
      await page.screenshot({ path: `evidence/friend-kong-${width}.png`, fullPage: true });
      await flip(friendCard, false);
    }
  } finally { await peerContext.close(); }
});
