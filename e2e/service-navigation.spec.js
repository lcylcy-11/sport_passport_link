import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../dwnc-app/server.js';
import { today, LEVELS } from '../dwnc-app/domain.js';

let application, directory;
const password = 'Navigation-fictional-482!';
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'dwnc-navigation-browser-'));
  application = await createApplication({ databasePath: path.join(directory, 'test.sqlite'), baseURL: 'http://127.0.0.1:4187', production: false });
  await new Promise(resolve => application.server.listen(4187, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  if (application) await application.close();
  if (directory) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe test cleanup path');
    rmSync(directory, { recursive: true, force: true });
  }
});
test.beforeEach(() => application.db.exec('DELETE FROM rateLimit'));

async function signup(page, name, email, region = '관악구') {
  await page.goto('/');
  await page.getByRole('button', { name: '처음이에요 · 회원가입' }).click();
  await page.locator('#auth-form [name="name"]').fill(name);
  await page.locator('#auth-form [name="region"]').fill(region);
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.locator('[name="confirmPassword"]').fill(password);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}
async function state(page) { return (await (await page.request.get('/api/state')).json()).state; }
async function command(page, type, payload) {
  const current = await (await page.request.get('/api/state')).json();
  const response = await page.request.post('/api/commands', {
    headers: { Origin: 'http://127.0.0.1:4187' },
    data: { type, payload, revision: current.revision, expectedUserId: current.state.activeUserId, requestId: randomUUID() },
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}
async function canonical(page, name) {
  await page.goto(`/#/${name}`);
  await expect(page.locator(`.content[data-page="${name}"]`)).toBeVisible();
}
async function verifyCanvas(page) {
  const values = await page.evaluate(() => {
    const shell = document.querySelector('.shell').getBoundingClientRect();
    const nav = document.querySelector('.tabbar').getBoundingClientRect();
    return {
      shell: { width: shell.width, x: shell.x }, nav: { width: nav.width, x: nav.x },
      width: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      faces: [...document.querySelectorAll('.passport-face')].map(node => node.getBoundingClientRect().width),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(values.overflow).toBe(false);
  expect(values.shell.width).toBeLessThanOrEqual(390.1);
  expect(Math.abs(values.shell.x - (values.width - values.shell.width) / 2)).toBeLessThan(1);
  expect(values.nav.width).toBeLessThanOrEqual(390.1);
  expect(values.nav.x).toBeGreaterThanOrEqual(values.shell.x - 1);
  expect(values.faces.every(width => width <= 390.1)).toBe(true);
  expect(values.colorScheme).toContain('light');
}

test('public home identity flips 180 degrees without replacing the card or losing keyboard focus', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await signup(page, '신분증 QA', 'navigation-flip@example.test');
  await page.getByRole('button', { name: '프로필 편집' }).click();
  await page.locator('#profile-form [name="gender"]').selectOption('여성');
  await page.locator('#profile-form [name="ageRange"]').fill('27세');
  await page.locator('#profile-form [name="tennis-experience"]').fill('3년');
  await page.locator('#profile-form button[type="submit"]').click();
  const card = page.locator('.content .passport-card');
  await expect(card.locator('.passport-flip')).toHaveAttribute('data-flipped', 'false');
  await expect(card.locator('.passport-front')).toContainText('신분증 QA');
  await expect(card.locator('.passport-fields')).toContainText('여성');
  await expect(card.locator('.passport-fields')).toContainText('27세');
  await expect(card.locator('.passport-sports')).toContainText('구력 3년');
  await expect(card.locator('.passport-back')).toHaveAttribute('aria-hidden', 'true');
  expect(await card.locator('.passport-back').evaluate(node => node.inert)).toBe(true);
  await page.evaluate(() => { window.t24Rotor = document.querySelector('.passport-rotor'); });
  const control = card.locator('.passport-flip-btn');
  await control.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.passport-flip')).toHaveAttribute('data-flipped', 'true');
  await expect(control).toHaveText('신분증 보기');
  await expect(control).toBeFocused();
  expect(await page.evaluate(() => window.t24Rotor === document.querySelector('.passport-rotor'))).toBe(true);
  await expect.poll(() => card.locator('.passport-rotor').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m11)).toBeLessThan(-0.999);
  await expect(card.locator('.passport-front')).toHaveAttribute('aria-hidden', 'true');
  expect(await card.locator('.passport-front').evaluate(node => node.inert)).toBe(true);
  expect(await card.locator('.passport-back').evaluate(node => node.inert)).toBe(false);
  await expect(page.locator('.content .kong-history')).toHaveCount(1);
  await expect(card.locator('.kong-history')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(card.locator('.passport-flip')).toHaveAttribute('data-flipped', 'false');
  await expect(control).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await control.click();
  // The global accessibility reset allows a 0.01ms transition so transition
  // completion events still fire; either that reset or no transition is valid.
  await expect.poll(() => card.locator('.passport-rotor').evaluate(node => Math.max(...getComputedStyle(node).transitionDuration.split(',').map(parseFloat)))).toBeLessThanOrEqual(0.00001);
  await expect(card.locator('.kong-art animate,.kong-art animateTransform,.kong-art animateMotion')).toHaveCount(0);
  await page.locator('.tabbar a[href="#/matches"]').click();
  await page.locator('.tabbar a[href="#/home"]').click();
  await expect(card.locator('.passport-flip')).toHaveAttribute('data-flipped', 'false');
  expect(errors).toEqual([]);
});

test('four bottom entries integrate matching schedule and community tabs within the glass mobile canvas', async ({ page }) => {
  await signup(page, '메뉴 QA', 'navigation-menu@example.test');
  await expect(page.locator('.tabbar a')).toHaveCount(4);
  expect(await page.locator('.tabbar a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual(['#/home', '#/matches', '#/ranking', '#/community']);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['home', 'matches', 'ranking', 'community']) {
      await canonical(page, name);
      await verifyCanvas(page);
    }
    await canonical(page, 'home');
    await page.screenshot({ path: `test-results/service-home-front-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.locator('.content .passport-flip-btn').click();
    await page.screenshot({ path: `test-results/service-home-kong-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await canonical(page, 'matches');
  await expect(page.locator('.schedule-section')).toContainText('내 운동 일정');
  await expect(page.locator('.recommendation-section')).toContainText('내 일정에 맞는 운동 친구');
  await page.locator('.schedule-section [data-action="recent-records"]').click();
  await expect(page.getByRole('heading', { name: '내 운동 기록', exact: true })).toBeVisible();
  await expect(page.locator('.activity-records')).toContainText('아직 저장한 운동 기록이 없어요');
  await page.locator('.activity-records a[href="#/home?face=kong"]').click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('.content .passport-flip')).toHaveAttribute('data-flipped', 'true');
  await canonical(page, 'community');
  await expect(page.locator('[data-action="community-tab"]')).toHaveCount(3);
  await expect(page.locator('[data-community-tab="friends"]')).toBeVisible();
  await page.locator('[data-action="community-tab"][data-id="groups"]').click();
  await expect(page.locator('[data-community-tab="groups"]')).toBeVisible();
  await expect(page.locator('[data-action="community-tab"][data-id="groups"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="community-tab"][data-id="friends"]').click();
  await expect(page.locator('#friend-form')).toBeVisible();
  await page.locator('[data-action="community-tab"][data-id="chats"]').click();
  await expect(page.locator('[data-community-tab="chats"]')).toBeVisible();
  await expect(page.locator('[data-action="community-tab"][data-id="chats"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.stamp,.celebrate')).toHaveCount(0);
});

test('regional ranking filters and matching hosts open other people on the public identity first', async ({ browser, page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await signup(page, '지역 참가자', 'navigation-region-player@example.test');
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const remoteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const remote = await remoteContext.newPage();
  try {
    await signup(host, '관악 운동 친구', 'navigation-region-host@example.test');
    const hostState = await state(host), hostUser = hostState.users.find(user => user.id === hostState.activeUserId);
    await command(host, 'profile.update', {
      name: hostUser.name, region: hostUser.region, avatar: hostUser.avatar, chosenSports: hostUser.chosenSports,
      gender: '남성', ageRange: '30대', bio: '같이 테니스 해요.',
      sports: { ...hostUser.sports, tennis: { ...hostUser.sports.tennis, ntrp: String(hostUser.sports.tennis.ntrp), experience: '5년' } },
    });
    await command(host, 'match.create', {
      sport: 'tennis', format: 'singles', visibility: 'public', title: '지역 추천 운동', region: '관악구', venue: '허구 지역 코트',
      date: today(), startTime: '00:00', endTime: '23:59', capacity: 2, level: LEVELS[0], description: '격리된 지역 매칭',
    });
    await signup(remote, '서초 운동 친구', 'navigation-region-remote@example.test', '서초구');
    const remoteState = await state(remote), remoteUser = remoteState.users.find(user => user.id === remoteState.activeUserId);
    await command(remote, 'profile.update', {
      name: remoteUser.name, region: remoteUser.region, avatar: remoteUser.avatar, chosenSports: remoteUser.chosenSports,
      gender: remoteUser.gender, ageRange: remoteUser.ageRange, bio: remoteUser.bio,
      sports: {
        ...remoteUser.sports,
        tennis: { ...remoteUser.sports.tennis, ntrp: String(remoteUser.sports.tennis.ntrp), experience: '2년' },
        running: { ...remoteUser.sports.running, experience: '6개월' },
      },
    });
    await page.reload();
    await canonical(page, 'matches');
    await expect(page.locator('.recommendation-section')).toContainText('지역 추천 운동');
    await page.locator('.recommendation-host').click();
    const publicCard = page.locator('.sheet .passport-card');
    await expect(publicCard.locator('.passport-flip')).toHaveAttribute('data-flipped', 'false');
    await expect(publicCard.locator('.passport-front')).toContainText('관악 운동 친구');
    await expect(publicCard.locator('.passport-front')).toContainText('구력 5년');
    await publicCard.locator('.passport-flip-btn').click();
    await expect(publicCard.locator('.passport-flip')).toHaveAttribute('data-flipped', 'true');
    await expect(publicCard.locator('.kong-cta')).toHaveCount(0);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await canonical(page, 'ranking');
    await expect(page.locator('#ranking-form [name="region"]')).toHaveValue('관악구');
    await expect(page.locator('.regional-rank')).toContainText('관악 운동 친구');
    await expect(page.locator('.regional-rank')).not.toContainText('서초 운동 친구');
    await expect(page.locator('.rank-metrics')).not.toHaveCount(0);
    await expect(page.locator('.regional-rank')).toContainText('최근 2주');
    await page.locator('.regional-rank [data-action="view-profile"][data-id="' + hostUser.id + '"]').click();
    await expect(publicCard.locator('.passport-flip')).toHaveAttribute('data-flipped', 'false');
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.locator('#ranking-form [name="region"]').selectOption('서초구');
    await expect(page.locator('.regional-rank')).toContainText('서초 운동 친구');
    await expect(page.locator('.regional-rank')).not.toContainText('관악 운동 친구');
    await page.locator('[data-action="rank-sport"][data-id="running"]').click();
    await expect(page.locator('.regional-rank')).toContainText('승률 미적용');
    await page.locator('.ranking-policy > summary').click();
    await expect(page.locator('.ranking-policy')).toContainText('최근 2주 운동 30점');
    expect(errors).toEqual([]);
  } finally { await hostContext.close(); await remoteContext.close(); }
});
