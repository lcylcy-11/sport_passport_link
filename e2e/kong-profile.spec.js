import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../dwnc-app/server.js';
import { today, LEVELS } from '../dwnc-app/domain.js';

let application, directory;
const password = 'Kong-fictional-browser-482!';
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'dwnc-kong-browser-'));
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
test.beforeEach(() => {
  // Independent journeys share only this disposable server. Reset its limiter,
  // otherwise unrelated fictional signups exhaust the real 5/minute policy.
  application.db.exec('DELETE FROM rateLimit');
});

async function signup(page, name, email) {
  await page.goto('/');
  await page.getByRole('button', { name: '처음이에요 · 회원가입' }).click();
  await page.locator('#auth-form [name="name"]').fill(name);
  await page.locator('#auth-form [name="region"]').fill('관악구');
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.locator('[name="confirmPassword"]').fill(password);
  const signupResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-up/email'));
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  expect((await signupResponse).status()).toBe(200);
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}
async function route(page, name) {
  await page.goto(`/#/${name}`);
  const requested = name.split('?')[0];
  const canonical = { profile: 'home', activity: 'matches', people: 'community', groups: 'community' }[requested] || requested;
  await expect(page.locator(`.content[data-page="${canonical}"]`)).toBeVisible();
}
async function showKong(page) {
  const card = page.locator('.content .passport-card');
  if (await card.locator('.passport-flip').getAttribute('data-flipped') !== 'true') await card.locator('.passport-flip-btn').click();
  await expect(card.locator('.passport-flip')).toHaveAttribute('data-flipped', 'true');
}
async function snapshot(page) {
  const response = await page.request.get('/api/state');
  expect(response.status()).toBe(200);
  return response.json();
}
async function command(page, type, payload, expectedStatus = 200) {
  const current = await snapshot(page);
  const response = await page.request.post('/api/commands', {
    headers: { Origin: 'http://127.0.0.1:4187' },
    data: { type, payload, revision: current.revision, expectedUserId: current.state.activeUserId, requestId: randomUUID() },
  });
  const result = await response.json();
  expect(response.status(), JSON.stringify(result)).toBe(expectedStatus);
  return result;
}
async function createRun(page, title) {
  return command(page, 'match.create', {
    sport: 'running', format: 'crew', visibility: 'public', title, region: '관악구', venue: '허구 QA 공원',
    date: today(), startTime: '00:00', endTime: '23:59', capacity: 4, level: LEVELS[0], description: '격리된 브라우저 테스트 운동',
  });
}
async function openResult(page, id) {
  await route(page, 'profile');
  await refresh(page);
  await route(page, `profile?match=${id}`);
  await page.locator('[data-action="result"]').click();
  await expect(page.locator('#result-form')).toBeVisible();
}
async function refresh(page) {
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
}
async function login(page, email) {
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
}
async function observeReactions(page) {
  await page.evaluate(() => {
    window.kongReactionObserver?.disconnect();
    window.kongReactionEvents = [];
    const seen = new WeakMap();
    const inspect = node => {
      if (!(node instanceof Element)) return;
      const candidates = [...node.querySelectorAll('.kong-mascot')];
      if (node.matches('.kong-mascot')) candidates.unshift(node);
      for (const mascot of candidates) {
        const motion = mascot.dataset.kongMotion;
        if (motion === 'react' && seen.get(mascot) !== 'react') window.kongReactionEvents.push(mascot.closest('.kong-profile')?.dataset.total);
        seen.set(mascot, motion);
      }
    };
    inspect(document.getElementById('app'));
    window.kongReactionObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') inspect(record.target);
        for (const node of record.addedNodes) inspect(node);
      }
    });
    window.kongReactionObserver.observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, attributeFilter: ['data-kong-motion'] });
  });
}
async function reactionCount(page) { return page.evaluate(() => window.kongReactionEvents.length); }
async function expectProfile(page, total, stage, condition) {
  const profile = page.locator('.content .kong-profile');
  await expect(profile).toHaveAttribute('data-total', String(total));
  await expect(profile).toHaveAttribute('data-stage', stage === null ? '' : String(stage));
  await expect(profile).toHaveAttribute('data-condition', condition === null ? '' : String(condition));
  await expect(profile.locator('.kong-mood')).toHaveText(condition === null ? '첫 기록' : ['쿨쿨', '시들시들', '촉촉', '쌩쌩'][condition]);
}
async function mobileCanvas(page) {
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.side')).toBeHidden();
  const bounds = await page.evaluate(() => {
    const shell = document.querySelector('.shell').getBoundingClientRect();
    const entries = [...document.querySelectorAll('.shell,.tabbar,.sheet,.toast:not([hidden])')].map(node => {
      const rect = node.getBoundingClientRect();
      return { selector: node.className, x: rect.x, right: rect.right, width: rect.width };
    });
    return {
      shell: { x: shell.x, width: shell.width }, canvasWidth: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      entries,
      cardColumns: [...document.querySelectorAll('.cards')].map(node => getComputedStyle(node).gridTemplateColumns.split(' ').length),
      light: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(bounds.overflow).toBe(false);
  expect(bounds.shell.width).toBeLessThanOrEqual(390.1);
  expect(Math.abs(bounds.shell.x - (bounds.canvasWidth - bounds.shell.width) / 2)).toBeLessThanOrEqual(1);
  expect(bounds.light).toContain('light');
  expect(bounds.cardColumns.every(count => count === 1)).toBe(true);
  for (const entry of bounds.entries) {
    expect(entry.width, entry.selector).toBeLessThanOrEqual(390.1);
    expect(entry.x, entry.selector).toBeGreaterThanOrEqual(bounds.shell.x - 1);
    expect(entry.right, entry.selector).toBeLessThanOrEqual(bounds.shell.x + bounds.shell.width + 1);
  }
}

test('new account opens a public identity, flips to a static baby Kong and keeps one exercise history', async ({ page }) => {
  await signup(page, '첫 콩 QA', 'kong-empty@example.test');
  await route(page, 'profile');
  await expect(page.locator('.passport-front')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.passport-back')).toHaveAttribute('inert', '');
  await showKong(page);
  await expect(page.locator('.kong-profile')).toBeVisible();
  await expectProfile(page, 0, null, null);
  await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'static');
  await expect(page.locator('.kong-art animate,.kong-art animateTransform,.kong-art animateMotion')).toHaveCount(0);
  await expect(page.locator('.kong-history')).toHaveCount(1);
  await expect(page.locator('.kong-history .kong-day')).toHaveCount(14);
  expect(await page.locator('.kong-day').evaluateAll(nodes => nodes.every(node => Number(node.dataset.count) === 0))).toBe(true);
  await expect(page.locator('.kong-profile')).not.toContainText('성장 곡선');
  await expect(page.locator('.kong-history [data-action="details"]')).toHaveCount(0);
  await page.locator('.kong-cta').click();
  await expect(page.locator('.content[data-page="matches"]')).toBeVisible();
});

test('actual saved attendance updates both accounts, unified history and persisted character state once', async ({ browser, page }) => {
  // This journey now includes two real approval sessions and a second refresh;
  // individual expectations keep their original five-second timeout.
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await signup(page, '콩 기록 모집자', 'kong-host@example.test');
  const hostId = (await snapshot(page)).state.activeUserId;
  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await otherContext.newPage();
  try {
    await signup(other, '콩 기록 참여자', 'kong-player@example.test');
    const playerId = (await snapshot(other)).state.activeUserId;
    const created = await command(page, 'match.create', {
      sport: 'tennis', format: 'singles', visibility: 'public', title: '콩 실제 참석 QA', region: '관악구', venue: '허구 QA 코트',
      date: today(), startTime: '00:00', endTime: '23:59', capacity: 2, level: LEVELS[0], description: '두 허구 계정 참석 검증',
    });
    await command(other, 'match.apply', { matchId: created.id });
    await command(page, 'match.decide', { matchId: created.id, applicantId: playerId, decision: 'accepted' });
    await openResult(page, created.id);
    await observeReactions(page);
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().postDataJSON().type === 'result.save');
    await page.locator('#result-form button[type="submit"]').click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const proposed = await response.json();
    expect(proposed.state.results.filter(result => result.matchId === created.id)).toHaveLength(0);
    const proposal = proposed.state.resultProposals.find(item => item.matchId === created.id && item.status === 'pending');
    expect(proposal.participantIds.sort()).toEqual([hostId, playerId].sort());
    expect(proposal.approvedIds).toEqual([hostId]);
    await expectProfile(page, 0, null, null);
    await expect(page.locator('.consensus-card')).toContainText('1/2명 승인');
    await expect(page.locator('.kong-history [data-action="details"]')).toHaveCount(0);
    expect(await reactionCount(page)).toBe(0);
    await other.reload();
    await route(other, `profile?match=${created.id}`);
    await expect(other.locator('.consensus-card')).toContainText('1/2명 승인');
    const approvalResponsePromise = other.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().postDataJSON().type === 'result.decide');
    await other.getByRole('button', { name: '동의하고 확정', exact: true }).click();
    const approvalResponse = await approvalResponsePromise;
    expect(approvalResponse.status()).toBe(200);
    const confirmed = await approvalResponse.json();
    expect(confirmed.state.results.find(result => result.matchId === created.id).attendedIds.sort()).toEqual([hostId, playerId].sort());
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    // Start observing the brief reward at the refresh boundary, before several
    // asynchronous profile checks can consume its 1.2-second visible interval.
    await Promise.all([
      refresh(page),
      expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'react'),
    ]);
    await expectProfile(page, 1, 0, 2);
    await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'idle');
    expect(await reactionCount(page)).toBe(1);
    await refresh(page);
    await expectProfile(page, 1, 0, 2);
    expect(await reactionCount(page)).toBe(1);
    await expect(page.locator('.kong-sport-items [data-kong-item="tennis"]')).toHaveAttribute('data-level', '1');
    await expect(page.locator('.kong-history .kong-day')).toHaveCount(14);
    await expect(page.locator(`.kong-day[data-kong-day="${today()}"]`)).toHaveAttribute('data-count', '1');
    await expect(page.locator(`.kong-history [data-action="details"][data-id="${created.id}"]`)).toHaveCount(1);
    await expect(page.locator('.kong-history')).toContainText('허구 QA 코트');
    await expect(page.locator('.stamp,.celebrate')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.locator('.passport-flip')).toHaveAttribute('data-flipped', 'true');
    await route(page, 'profile');
    await page.reload();
    await expectProfile(page, 1, 0, 2);
    await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'idle');
    await other.reload();
    await route(other, 'profile');
    await expectProfile(other, 1, 0, 2);
    await expect(other.locator('.kong-sport-items [data-kong-item="tennis"]')).toHaveAttribute('data-level', '1');
    await expect(other.locator(`.kong-history [data-id="${created.id}"]`)).toHaveCount(1);
    await page.locator('[data-action="logout"]').click();
    await expect(page.locator('#auth-form')).toBeVisible();
    await login(page, 'kong-host@example.test');
    await route(page, 'profile');
    await expectProfile(page, 1, 0, 2);
    expect(errors).toEqual([]);
  } finally { await otherContext.close(); }
});

test('failed save and real revision conflict never add records or play a reaction; valid retry does', async ({ page }) => {
  await signup(page, '콩 실패 QA', 'kong-failure@example.test');
  const created = await createRun(page, '콩 실패 재시도 QA');
  await openResult(page, created.id);
  await observeReactions(page);
  await page.route('**/api/commands', async intercepted => {
    if (intercepted.request().postDataJSON().type === 'result.save') await intercepted.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '허구 테스트 저장 실패', code: 'TEST_UNAVAILABLE' }) });
    else await intercepted.continue();
  });
  await page.locator('#result-form button[type="submit"]').click();
  await expect(page.locator('.toast.error')).toBeVisible();
  await expectProfile(page, 0, null, null);
  expect((await snapshot(page)).state.results.some(result => result.matchId === created.id)).toBe(false);
  expect(await reactionCount(page)).toBe(0);
  await page.unroute('**/api/commands');
  await openResult(page, created.id);
  await observeReactions(page);
  // Another genuine local API write makes the loaded UI revision stale.
  await command(page, 'note.save', { date: today(), text: '동시 변경 QA' });
  const conflictPromise = page.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().postDataJSON().type === 'result.save');
  await page.locator('#result-form button[type="submit"]').click();
  expect((await conflictPromise).status()).toBe(409);
  await expect(page.locator('.toast.error')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await expectProfile(page, 0, null, null);
  expect(await reactionCount(page)).toBe(0);
  await openResult(page, created.id);
  await observeReactions(page);
  await page.locator('#result-form button[type="submit"]').click();
  await expectProfile(page, 1, 0, 2);
  await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'idle');
  expect(await reactionCount(page)).toBe(1);
});

test('lost successful response retries idempotently and shows only one real success reaction', async ({ page }) => {
  await signup(page, '콩 재전송 QA', 'kong-replay@example.test');
  const created = await createRun(page, '콩 응답 유실 QA');
  await openResult(page, created.id);
  await observeReactions(page);
  let committedEnvelope;
  await page.route('**/api/commands', async intercepted => {
    const envelope = intercepted.request().postDataJSON();
    if (envelope.type === 'result.save' && !committedEnvelope) {
      committedEnvelope = envelope;
      const response = await intercepted.fetch();
      expect(response.status()).toBe(200);
      await intercepted.abort('failed');
    } else await intercepted.continue();
  });
  await page.locator('#result-form button[type="submit"]').click();
  await expectProfile(page, 1, 0, 2);
  await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'idle');
  expect(await reactionCount(page)).toBe(1);
  await page.unroute('**/api/commands');
  expect((await snapshot(page)).state.results.filter(result => result.matchId === created.id)).toHaveLength(1);
  // Replaying the acknowledged command returns the same DB record, never a second exercise.
  await observeReactions(page);
  const duplicate = await page.request.post('/api/commands', { headers: { Origin: 'http://127.0.0.1:4187' }, data: committedEnvelope });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).replayed).toBe(true);
  await refresh(page);
  await expectProfile(page, 1, 0, 2);
  expect(await reactionCount(page)).toBe(0);
});

test('keyboard reaction preserves focus and is cancelled by card flip, navigation or account change', async ({ page }) => {
  await signup(page, '콩 키보드 QA', 'kong-keyboard@example.test');
  const created = await createRun(page, '콩 키보드 운동 QA');
  const id = (await snapshot(page)).state.activeUserId;
  await command(page, 'result.save', { matchId: created.id, data: { attendedIds: [id], entries: { [id]: { distanceKm: 5, paceSec: 340 } } } });
  await page.reload();
  await route(page, 'profile');
  await showKong(page);
  const mascot = page.locator('.kong-mascot');
  await observeReactions(page);
  await mascot.focus();
  await page.keyboard.press('Enter');
  await expect(mascot).toHaveAttribute('data-kong-motion', 'react');
  await expect(mascot).toHaveAttribute('data-kong-motion', 'idle');
  await expect(mascot).toBeFocused();
  expect(await reactionCount(page)).toBe(1);
  await page.keyboard.press('Space');
  await expect(mascot).toHaveAttribute('data-kong-motion', 'react');
  await page.locator('.content .passport-flip-btn').click();
  await expect(page.locator('.content .passport-flip')).toHaveAttribute('data-flipped', 'false');
  await expect(mascot).toHaveAttribute('data-kong-motion', 'idle');
  await showKong(page);
  await expect(mascot).toHaveAttribute('data-kong-motion', 'idle');
  await mascot.click();
  await expect(mascot).toHaveAttribute('data-kong-motion', 'react');
  await route(page, 'matches');
  await route(page, 'profile');
  await expect(mascot).toHaveAttribute('data-kong-motion', 'idle');
  await showKong(page);
  await mascot.click();
  await expect(mascot).toHaveAttribute('data-kong-motion', 'react');
  await page.locator('[data-action="logout"]').click();
  await expect(page.locator('#auth-form')).toBeVisible();
  // Switch accounts within the same browser so a stale reaction cannot return for the new user.
  await page.getByRole('button', { name: '처음이에요 · 회원가입' }).click();
  await page.locator('[name="name"]').fill('콩 새 계정 QA');
  await page.locator('[name="region"]').fill('관악구');
  await page.locator('[name="email"]').fill('kong-changed-account@example.test');
  await page.locator('[name="password"]').fill(password);
  await page.locator('[name="confirmPassword"]').fill(password);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await route(page, 'profile');
  await expectProfile(page, 0, null, null);
  await expect(mascot).toHaveAttribute('data-kong-motion', 'static');
  await page.waitForTimeout(1250);
  await expect(mascot).toHaveAttribute('data-kong-motion', 'static');
});

test('reduced motion creates no SVG animation, including noise, and repeated Kong SVGs have independent IDs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signup(page, '콩 정지 QA', 'kong-reduced@example.test');
  const created = await createRun(page, '콩 정지 운동 QA');
  const id = (await snapshot(page)).state.activeUserId;
  await command(page, 'result.save', { matchId: created.id, data: { attendedIds: [id], entries: { [id]: { distanceKm: 5, paceSec: 340 } } } });
  await page.reload();
  await route(page, 'profile');
  await showKong(page);
  await expectProfile(page, 1, 0, 2);
  await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'static');
  await page.locator('.kong-mascot').click();
  await expect(page.locator('.kong-art animate,.kong-art animateTransform,.kong-art animateMotion')).toHaveCount(0);
  const multiple = await page.evaluate(async () => {
    const { render } = await import('/kong.js');
    const holder = document.createElement('div');
    holder.innerHTML = render({ cond: 2, stage: 0, items: { tennis: 1 }, motion: false }) + render({ cond: 2, stage: 0, items: { tennis: 1 }, motion: false });
    const ids = [...holder.querySelectorAll('[id]')].map(node => node.id);
    return { count: ids.length, unique: new Set(ids).size, unresolved: [...holder.querySelectorAll('[filter]')].filter(node => !holder.querySelector(`[id="${node.getAttribute('filter').slice(5, -1)}"]`)).length };
  });
  expect(multiple.count).toBeGreaterThan(1);
  expect(multiple.unique).toBe(multiple.count);
  expect(multiple.unresolved).toBe(0);
});

test('long names and canonical routes plus aliases stay in the mobile canvas; edit, photo, records and PNG remain usable', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const longName = '가나다라마바사아자차카타파하가나다라마바사아자차';
  expect(longName.length).toBe(24);
  await signup(page, longName, 'kong-layout@example.test');
  const created = await createRun(page, '콩 화면 회귀 QA');
  const id = (await snapshot(page)).state.activeUserId;
  await command(page, 'result.save', { matchId: created.id, data: { attendedIds: [id], entries: { [id]: { distanceKm: 5, paceSec: 340 } } } });
  await page.reload();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['home', 'matches', 'community', 'activity', 'ranking', 'profile', 'people', 'groups', 'notifications']) {
      await route(page, name);
      await mobileCanvas(page);
    }
    await route(page, 'profile');
    await expect(page.locator('.passport-front')).toContainText(longName);
    await expectProfile(page, 1, 0, 2);
    await page.screenshot({ path: `test-results/kong-profile-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.locator(`.kong-history [data-id="${created.id}"]`).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await mobileCanvas(page);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.locator('.backdrop')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: '프로필 편집' }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
    canvas.getContext('2d').fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#profile-photo').setInputFiles({ name: 'fictional-test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect.poll(async () => (await snapshot(page)).state.users.find(user => user.id === id).photo).toMatch(/^data:image\/jpeg;base64,/);
  await page.locator('#profile-form [name="bio"]').fill('콩 회귀 검증 소개');
  for (const sport of ['tennis', 'futsal']) {
    const input = page.locator(`#profile-form [name="chosenSports"][value="${sport}"]`);
    await input.locator('..').click();
    await expect(input).not.toBeChecked();
  }
  await page.locator('#profile-form [name="running-experience"]').fill('2년');
  await page.locator('#profile-form button[type="submit"]').click();
  await expect(page.locator('#profile-form')).toHaveCount(0);
  await expect(page.locator('.toast:not([hidden])')).toBeVisible();
  await mobileCanvas(page);
  await page.reload();
  await page.locator('.home-summary-details > summary').click();
  await expect(page.getByText('콩 회귀 검증 소개', { exact: true })).toBeVisible();
  const savedUser = (await snapshot(page)).state.users.find(user => user.id === id);
  expect(savedUser.chosenSports).toEqual(['running']);
  expect(savedUser.sports.running.experience).toBe('2년');
  expect(savedUser.photo).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator('.stamp,.celebrate')).toHaveCount(0);
  await expect(page.locator('.kong-history')).toContainText('허구 QA 공원');
  await page.getByRole('button', { name: '프로필 카드 공유' }).click();
  await expect(page.locator('.card-preview')).toBeVisible();
  await mobileCanvas(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('a[download]').click();
  const download = await downloadPromise;
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  expect(errors).toEqual([]);
});

test('attended no-contest tennis grows Kong once and recent plus all-records views open safe details', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await signup(page, '콩 미성립 QA', 'kong-no-contest@example.test');
  const created = await command(page, 'match.create', {
    sport: 'tennis', format: 'singles', visibility: 'public', title: '콩 미성립 참석 QA', region: '관악구', venue: '허구 미성립 코트',
    date: today(), startTime: '00:00', endTime: '23:59', capacity: 2, level: LEVELS[0], description: '참석 한 명의 미성립 운동 검증',
  });
  await openResult(page, created.id);
  const noContest = page.locator('#result-form [name="noContest"]');
  await noContest.locator('..').click();
  await expect(noContest).toBeChecked();
  await page.locator('#result-form button[type="submit"]').click();
  await expectProfile(page, 1, 0, 2);
  await expect(page.locator('.kong-mascot')).toHaveAttribute('data-kong-motion', 'idle');
  await route(page, 'profile');
  const stats = await page.evaluate(async () => {
    const current = await (await fetch('/api/state')).json();
    const { statsFor } = await import('/extended-domain.js');
    return statsFor(current.state, current.state.activeUserId).tennis;
  });
  expect(stats.games).toBe(0);
  await page.locator(`.kong-history [data-id="${created.id}"]`).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.sheet .breakdown')).toContainText('미성립');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('.backdrop')).toHaveCount(0);
  await page.locator('.content [data-action="recent-records"]').click();
  await expect(page.locator('.activity-records')).toBeVisible();
  await page.locator(`.activity-records > .block .rows [data-action="details"][data-id="${created.id}"]`).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('.sheet .breakdown')).toContainText('미성립');
  expect(errors).toEqual([]);
});
