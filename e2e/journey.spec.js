import { test, expect } from '@playwright/test';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../dwnc-app/server.js';

let application, directory;
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(),'dwnc-browser-'));
  application = await createApplication({databasePath:path.join(directory,'test.sqlite'),baseURL:'http://127.0.0.1:4187',production:false});
  await new Promise(resolve => application.server.listen(4187,'127.0.0.1',resolve));
});
test.afterAll(async () => {
  if (application) await application.close();
  if (directory) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe test cleanup path');
    rmSync(directory,{recursive:true,force:true});
  }
});

const password = 'Browser-fictional-482!';
async function signup(page,name,email) {
  await page.goto('/');
  await page.getByRole('button',{name:'처음이에요 · 회원가입'}).click();
  await page.locator('#auth-form [name="name"]').fill(name);
  await page.locator('#auth-form [name="region"]').fill('관악구');
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.locator('[name="confirmPassword"]').fill(password);
  await page.getByRole('button',{name:'회원가입',exact:true}).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('.top .who__name')).toHaveText(name);
  const state = (await (await page.request.get('/api/state')).json()).state;
  expect(state.users.find(u => u.id === state.activeUserId).region).toBe('관악구');
}
async function login(page,email) {
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
}
async function route(page,name) {
  await page.goto(`/#/${name}`);
  const canonical = { profile: 'home', activity: 'matches', people: 'community', groups: 'community' }[name] || name;
  await expect(page.locator(`.content[data-page="${canonical}"]`)).toBeVisible();
}
async function refresh(page) {
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
}
async function noOverflow(page) {expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);}

test('actual mobile signup → two-user matching → exercise record → logout/login and shared persistence',async ({browser,page}) => {
  const errors = [];page.on('pageerror',error => errors.push(error.message));
  await signup(page,'브라우저 모집자','browser-host@example.test');
  await page.locator('#note-form [name="note"]').fill('오늘 QA 한 줄');
  await page.locator('#note-form button[type="submit"]').click();
  await expect(page.locator('#note-form [name="note"]')).toHaveValue('오늘 QA 한 줄');
  await route(page,'matches');
  await page.locator('.head [data-action="create"]').click();
  const form = page.locator('#create-form');
  await form.locator('[name="title"]').fill('브라우저 QA 테니스');
  await form.locator('[name="venue"]').fill('QA 코트');
  await form.locator('[name="startTime"]').fill('00:00');
  await form.locator('[name="endTime"]').fill('23:59');
  await form.locator('[name="level"]').selectOption('입문');
  await form.locator('[name="description"]').fill('실제 브라우저 가입과 DB 저장 검증용');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.content[data-page="matches"]')).toBeVisible();
  await expect(page.locator('.schedule-section [data-action="details"]',{hasText:'브라우저 QA 테니스'})).toBeVisible();
  const otherContext = await browser.newContext({viewport:{width:390,height:844}});
  const other = await otherContext.newPage();other.on('pageerror',error => errors.push(error.message));
  await signup(other,'브라우저 참여자','browser-player@example.test');
  await route(other,'matches');
  await other.locator('.matching-search [data-action="details"]',{hasText:'브라우저 QA 테니스'}).click();
  await other.locator('[data-action="apply"]').click();
  await expect(other.locator('.backdrop')).toHaveCount(0);
  await refresh(page);
  await page.locator('.schedule-section [data-action="details"]',{hasText:'브라우저 QA 테니스'}).click();
  await page.locator('[data-action="decide"][data-decision="accepted"]').click();
  await expect(page.locator('[data-action="decide"]')).toHaveCount(0);
  await page.locator('[data-action="result"]').click();
  await expect(page.locator('#result-form')).toBeVisible();
  const proposalResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().postDataJSON().type === 'result.save');
  await page.locator('#result-form button[type="submit"]').click();
  const proposalResponse = await proposalResponsePromise;
  expect(proposalResponse.status()).toBe(200);
  const proposed = await proposalResponse.json();
  const proposal = proposed.state.resultProposals.find(item => item.status === 'pending');
  expect(proposal.participantIds).toHaveLength(2);
  expect(proposal.approvedIds).toHaveLength(1);
  expect(proposed.state.results.filter(item => item.matchId === proposal.matchId)).toHaveLength(0);
  await expect(page.locator('.consensus-card')).toContainText('1/2명 승인');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await route(page,'profile');
  await expect(page.locator('.kong-profile')).toHaveAttribute('data-total','0');
  await expect(page.locator('.kong-history .kong-log-row')).toHaveCount(0);
  await other.reload();
  await route(other,'matches');
  await other.locator(`.schedule-section [data-action="details"][data-id="${proposal.matchId}"]`).click();
  await expect(other.locator('.consensus-card')).toContainText('1/2명 승인');
  const approvalResponsePromise = other.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().postDataJSON().type === 'result.decide');
  await other.getByRole('button',{name:'동의하고 확정',exact:true}).click();
  const approvalResponse = await approvalResponsePromise;
  expect(approvalResponse.status()).toBe(200);
  expect((await approvalResponse.json()).state.results.filter(item => item.matchId === proposal.matchId)).toHaveLength(1);
  await refresh(page);
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await expect(page.locator('.passport-flip')).toHaveAttribute('data-flipped','true');
  await route(page,'profile');
  await expect(page.locator('.kong-history .kong-log-row')).toHaveCount(1);
  await expect(page.locator('.stamp,.celebrate')).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({path:'test-results/profile-390.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'프로필 카드 공유'}).click();
  await expect(page.locator('.card-preview')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('a[download]').click();
  const download = await downloadPromise;
  const png = readFileSync(await download.path());
  expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(630);
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.locator('[data-action="logout"]').click();
  await expect(page.locator('#auth-form')).toBeVisible();
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await login(page,'browser-host@example.test');
  await expect(page.locator('#note-form [name="note"]')).toHaveValue('오늘 QA 한 줄');
  await page.reload();await expect(page.locator('#note-form [name="note"]')).toHaveValue('오늘 QA 한 줄');
  await other.reload();
  await route(other,'profile');await expect(other.locator('.kong-history .kong-log-row')).toHaveCount(1);
  // Exercise all real entry points and inherited mobile constraints.
  for (const width of [320,390,1280]) {
    await page.setViewportSize({width,height:844});
    for (const name of ['home','matches','community','activity','ranking','profile','people','groups','notifications']) {await route(page,name);await noOverflow(page);}
  }
  expect(errors).toEqual([]);
  await otherContext.close();
});

test('account form validation, login failure, profile editing, group and friend UI, server error retry',async ({page}) => {
  const errors = [];page.on('pageerror',error => errors.push(error.message));
  await signup(page,'빈 상태 QA','empty@example.test');
  await route(page,'groups');await expect(page.getByText('첫 그룹을 만들어 보세요')).toBeVisible();
  await page.locator('[data-action="create-group"]').click();
  await page.locator('#group-form [name="name"]').fill('브라우저 QA 그룹');
  await page.locator('#group-form button[type="submit"]').click();
  await expect(page.locator('.gcard',{hasText:'브라우저 QA 그룹'})).toBeVisible();
  await route(page,'profile');await page.getByRole('button',{name:'프로필 편집'}).click();
  await page.locator('#profile-form [name="bio"]').fill('수정한 소개');
  await page.locator('#profile-form button[type="submit"]').click();
  await page.reload();
  await page.locator('.home-summary-details > summary').click();
  await expect(page.getByText('수정한 소개',{exact:true})).toBeVisible();
  await page.locator('[data-action="logout"]').click();
  await page.locator('[name="email"]').fill('empty@example.test');
  await page.locator('[name="password"]').fill('wrong-browser-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.locator('.toast.error')).toBeVisible();await expect(page.locator('#auth-form')).toBeVisible();
  await login(page,'empty@example.test');
  await page.route('**/api/state',route => route.abort());
  await page.reload();await expect(page.getByText('기록을 불러오지 못했어요')).toBeVisible();
  await page.unroute('**/api/state');await page.getByRole('button',{name:'다시 시도'}).click();
  await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  expect(errors).toEqual([]);
});
