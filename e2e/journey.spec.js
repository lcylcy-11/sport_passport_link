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
  await page.goto(`/#/${name}`);await expect(page.locator(`.content[data-page="${name}"]`)).toBeVisible();
}
async function refresh(page) {
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
}
async function noOverflow(page) {
  const report = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, route: location.hash,
    offenders: [...document.querySelectorAll('.shell *')].map(el => ({ className: el.className, right: el.getBoundingClientRect().right })).filter(item => item.right > innerWidth + 1).slice(0, 8) }));
  expect(report.documentWidth <= report.width, JSON.stringify(report)).toBe(true);
}

test('actual mobile signup → two-user matching → result/stamp → logout/login and shared persistence',async ({browser,page}) => {
  const errors = [];page.on('pageerror',error => errors.push(error.message));
  await signup(page,'브라우저 모집자','browser-host@example.test');
  await expect(page.locator('.home-profile')).toContainText('매너지수');
  await expect(page.locator('.home-profile')).toContainText('주활동 지역');
  await expect(page.locator('.home-profile')).toContainText('관악구');
  await expect(page.locator('.home-profile')).toContainText('연령대');
  await expect(page.locator('.home-profile')).toContainText('20대');
  await expect(page.locator('.home-profile')).toContainText('경기 수');
  await expect(page.locator('.home-profile')).toContainText('승률');
  await expect(page.locator('.home-profile')).toContainText('MVP 선정');
  await expect(page.locator('.home-profile')).toContainText('누적 거리');
  await expect(page.locator('#note-form')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'근처 자리',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'TENNIS',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'콩 성장 상태 보기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'콩 성장 상태',exact:true})).toBeVisible();
  await expect(page.locator('.home-equipment-slot.tennis')).toContainText('라켓 레벨');
  await expect(page.locator('.home-equipment-slot.futsal')).toContainText('축구공 레벨');
  await expect(page.locator('.home-equipment-slot.running')).toContainText('러닝화 레벨');
  await expect(page.locator('.home-growth-activity dd')).toHaveText(['0회', '0회', '0회']);
  await expect(page.locator('.home-kong-name')).toHaveText('콩식이');
  await page.getByRole('button',{name:'콩 닉네임 변경',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'콩 닉네임'})).toBeVisible();
  await page.getByRole('textbox',{name:'닉네임',exact:true}).fill('   ');
  await page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'콩 닉네임'})).toBeVisible();
  await page.getByRole('textbox',{name:'닉네임',exact:true}).fill('  콩 <친구>  ');
  await page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.home-kong-name')).toHaveText('콩 <친구>');
  await expect(page.getByRole('heading',{name:'콩 성장 상태',exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'콩 성장 상태 보기',exact:true}).click();
  await expect(page.locator('.home-kong-name')).toHaveText('콩 <친구>');
  await page.getByRole('button',{name:'내 플레이 프로필 보기',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'내 플레이 프로필',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'홈 프로필 이미지 변경',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'홈 프로필 이미지'})).toBeVisible();
  await expect(page.getByRole('button',{name:'프로필 사진',exact:true})).toBeDisabled();
  await page.locator('#home-profile-photo').setInputFiles('dwnc-app/assets/kong-preview-v1.png');
  await expect(page.locator('.home-avatar')).toHaveClass('home-avatar photo');
  await expect(page.locator('.home-avatar img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await page.reload();
  await expect(page.locator('.home-avatar')).toHaveClass('home-avatar photo');
  await page.getByRole('button',{name:'홈 프로필 이미지 변경',exact:true}).click();
  await page.getByRole('button',{name:'콩 캐릭터',exact:true}).click();
  await expect(page.locator('.home-avatar img')).toHaveAttribute('src','./assets/kong-preview-v1.png');
  await page.reload();
  await expect(page.locator('.home-avatar')).toHaveClass('home-avatar kong');
  await page.screenshot({path:'test-results/home-glass-front.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'콩 성장 상태 보기',exact:true}).click();
  await page.screenshot({path:'test-results/home-glass-back.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'내 플레이 프로필 보기',exact:true}).click();
  await page.locator('.home-shortcut[href="#/groups"]').click();
  await expect(page.locator('.content[data-page="groups"]')).toBeVisible();
  await route(page,'home');
  await page.locator('.home-shortcut[href="#/ranking"]').click();
  await expect(page.locator('.content[data-page="ranking"]')).toBeVisible();
  await route(page,'home');
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
  await expect(page.locator('.content[data-page="activity"]')).toBeVisible();
  await expect(page.locator('[data-action="details"]',{hasText:'브라우저 QA 테니스'})).toBeVisible();
  const otherContext = await browser.newContext({viewport:{width:390,height:844}});
  const other = await otherContext.newPage();other.on('pageerror',error => errors.push(error.message));
  await signup(other,'브라우저 참여자','browser-player@example.test');
  await other.getByRole('button',{name:'콩 성장 상태 보기',exact:true}).click();
  await expect(other.locator('.home-kong-name')).toHaveText('콩식이');
  await route(other,'matches');
  await other.locator('[data-action="details"]',{hasText:'브라우저 QA 테니스'}).click();
  await other.locator('[data-action="apply"]').click();
  await expect(other.locator('.backdrop')).toHaveCount(0);
  await refresh(page);
  await page.locator('[data-action="details"]',{hasText:'브라우저 QA 테니스'}).click();
  await page.locator('[data-action="decide"][data-decision="accepted"]').click();
  await expect(page.locator('[data-action="decide"]')).toHaveCount(0);
  await page.locator('[data-action="result"]').click();
  await expect(page.locator('#result-form')).toBeVisible();
  await page.locator('#result-form button[type="submit"]').click();
  await expect(page.locator('.celebrate')).toBeVisible();
  await expect(page.locator('.celebrate')).toHaveCount(0);
  await route(page,'profile');
  await expect(page.locator('.stamp')).not.toHaveCount(0);
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
  await expect(page.locator('.home-profile')).toContainText('브라우저 모집자');
  await expect(page.locator('.home-profile__front .home-sport.tennis')).toContainText('100%');
  await page.reload();await expect(page.locator('.home-profile__front .home-sport.tennis')).toContainText('100%');
  await page.getByRole('button',{name:'콩 성장 상태 보기',exact:true}).click();
  await expect(page.locator('.home-growth-activity .tennis dd')).toHaveText('1회');
  await expect(page.locator('.home-growth-activity .futsal dd')).toHaveText('0회');
  await expect(page.locator('.home-kong-name')).toHaveText('콩 <친구>');
  await page.getByRole('button',{name:'프로필에서 자세히 보기',exact:true}).click();
  await expect(page.locator('.content[data-page="profile"]')).toBeVisible();
  await route(other,'profile');await expect(other.locator('.stamp')).not.toHaveCount(0);
  // Exercise all real entry points and inherited mobile constraints.
  for (const width of [320,390,402,1280]) {
    await page.setViewportSize({width,height:width === 402 ? 874 : 844});
    for (const name of ['home','matches','activity','ranking','profile','people','groups','notifications']) {
      await route(page,name);await noOverflow(page);
      if (name === 'home') {
        const frontSize = await page.locator('.home-profile').evaluate(el => ({ height: el.offsetHeight, width: el.offsetWidth, actionsTop: el.nextElementSibling.offsetTop }));
        await page.getByRole('button',{name:'콩 성장 상태 보기',exact:true}).click();
        await expect(page.getByRole('heading',{name:'콩 성장 상태',exact:true})).toBeVisible();
        await noOverflow(page);
        expect(await page.locator('.home-profile').evaluate(el => ({ height: el.offsetHeight, width: el.offsetWidth, actionsTop: el.nextElementSibling.offsetTop }))).toEqual(frontSize);
        expect(await page.locator('.home-profile__back').evaluate(el => el.offsetHeight)).toBe(frontSize.height);
        await page.getByRole('button',{name:'내 플레이 프로필 보기',exact:true}).click();
        expect(await page.locator('.home-profile').evaluate(el => ({ height: el.offsetHeight, width: el.offsetWidth, actionsTop: el.nextElementSibling.offsetTop }))).toEqual(frontSize);
      }
    }
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
  await page.reload();await expect(page.getByText('수정한 소개',{exact:true})).toBeVisible();
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
