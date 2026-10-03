import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../dwnc-app/server.js';
import { LEVELS } from '../dwnc-app/domain.js';
import { koreaToday } from '../dwnc-app/clock.js';
const origin = 'http://127.0.0.1:4196', password = 'Recovery-fictional-2026!';
let application;
test.use({baseURL:origin,reducedMotion:'reduce'});
test.beforeEach(async()=>{
  application=await createApplication({databasePath:':memory:',baseURL:origin,production:false});
  await new Promise(resolve=>application.server.listen(4196,'127.0.0.1',resolve));
});
test.afterEach(async()=>{await application?.close();});
async function snapshot(page){return (await page.request.get('/api/state')).json();}
async function signup(page, email='detail@example.test') {
  const result=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{name:'운동 친구',email,password}});
  expect(result.status()).toBe(200);
}
async function command(page,type,payload) {
  const current=await snapshot(page);
  const response=await page.request.post('/api/commands',{headers:{Origin:origin},data:{type,payload,revision:current.revision,expectedUserId:current.state.activeUserId,requestId:randomUUID()}});
  expect(response.status(),await response.text()).toBe(200);return response.json();
}
const matchPayload = description => ({sport:'running',title:'함께 러닝',region:'송파구',venue:'허구 공원',date:koreaToday(new Date(Date.now()+86400000*2)),startTime:'19:00',endTime:'20:00',capacity:4,level:LEVELS[0],description,format:'crew',visibility:'public'});
async function groupDetail(page,id) {
  await page.goto('/#/community?tab=groups');
  await page.locator(`[data-action="group-detail"][data-id="${id}"]`).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
}
async function fits(page) {
  expect(await page.locator('.sheet').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const sheet=await page.locator('.sheet').boundingBox();
  for(const button of await page.locator('.sheet > .sheet__actions > button').all()) {
    const rect=await button.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(sheet.x);
    expect(rect.x+rect.width).toBeLessThanOrEqual(sheet.x+sheet.width+1);
  }
}
test('host actions fit 320/390/1280 and cancel/back keeps the existing workout',async({page},info)=>{
  await signup(page);const created=await command(page,'match.create',matchPayload('천천히 뛰어요.'));
  for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/#/matches');
    await page.locator(`[data-action="details"][data-id="${created.id}"]`).first().click();
    await expect(page.locator('.sheet [data-action="cancel-match"]')).toBeVisible();
    await fits(page);
    await page.screenshot({path:info.outputPath(`actions-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'자리 취소',exact:true}).click();
    await expect(page.locator('#modal-title')).toHaveText('자리 취소');
    await page.getByRole('button',{name:'유지',exact:true}).click();
    await expect(page.locator('#modal-title')).toHaveText('함께 러닝');
    await page.keyboard.press('Escape');await expect(page.locator('.sheet')).toHaveCount(0);
    expect((await snapshot(page)).state.matches.find(item=>item.id===created.id).status).toBe('open');
  }
});
test('long unbroken descriptions wrap in group and workout details at all supported widths',async({page},info)=>{
  await signup(page);
  const group=await command(page,'group.create',{name:'모임',region:'송파구',description:'https://example.test/'+ 'x'.repeat(260)});
  const created=await command(page,'match.create',matchPayload('https://example.test/'+ 'y'.repeat(470)));
  for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:844});
    await groupDetail(page,group.id); await fits(page);
    await page.screenshot({path:info.outputPath(`group-${width}.png`),fullPage:true});
    await page.goto(`/#/matches?match=${created.id}`); await expect(page.locator('.sheet .desc')).toContainText('https://example.test/'); await fits(page);
    await page.screenshot({path:info.outputPath(`workout-${width}.png`),fullPage:true});
  }
});
test('failed chat open preserves dialog keyboard handling and then retries successfully',async({page})=>{
  await signup(page);const group=await command(page,'group.create',{name:'오류 복구 모임',region:'송파구',description:'테스트'});
  await groupDetail(page,group.id);
  await page.route('**/api/chats/open',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'허구 서버 오류'})}));
  await page.getByRole('button',{name:'그룹 채팅',exact:true}).click();
  await expect(page.locator('.toast.error')).toBeVisible();await expect(page.locator('.sheet')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.sheet')).toHaveCount(0);
  expect(await page.locator('.shell').evaluate(node=>node.inert)).toBe(false);
  await page.unroute('**/api/chats/open');await groupDetail(page,group.id);
  await page.getByRole('button',{name:'그룹 채팅',exact:true}).click();
  await expect(page.locator('.chat-room-view')).toBeVisible();await expect(page.locator('.sheet')).toHaveCount(0);
});
test('revoked chat session returns to login and reauthentication restores authorized access',async({page})=>{
  await signup(page);const group=await command(page,'group.create',{name:'세션 모임',region:'송파구',description:'테스트'});
  await groupDetail(page,group.id);await page.getByRole('button',{name:'그룹 채팅',exact:true}).click();
  await expect(page.locator('.chat-room-view')).toBeVisible();
  await page.locator('#chat-message-text').fill('이전 계정의 작성 중 메시지');
  const signedOut=await page.request.post('/api/auth/sign-out',{headers:{Origin:origin},data:{}});expect(signedOut.status()).toBe(200);
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await expect(page.locator('#auth-form')).toBeVisible({timeout:12000});await expect(page.locator('.chat-room-view')).toHaveCount(0);
  await page.locator('[name="email"]').fill('detail@example.test');await page.locator('[name="password"]').fill(password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('.content[data-page="home"]')).toBeVisible();
  await groupDetail(page,group.id);await page.getByRole('button',{name:'그룹 채팅',exact:true}).click();await expect(page.locator('.chat-room-view')).toBeVisible();
  await expect(page.locator('#chat-message-text')).toHaveValue('');
});
test('reload discards an old account setup and a newer saved profile without overwriting either',async({page})=>{
  await signup(page,'first@example.test');const first=await snapshot(page),a=first.state.activeUserId;
  await page.goto('/');await page.evaluate(id=>sessionStorage.setItem('dwnc.signup-recovery.v1',JSON.stringify({version:1,expiresAt:Date.now()+3600000,ownerId:id,region:'옛 지역',ageRange:'30대',chosenSports:['running']})),a);
  const me=first.state.users.find(person=>person.id===a);
  await command(page,'profile.update',{name:me.name,region:'새 지역',ageRange:'40대',gender:me.gender,bio:me.bio,avatar:me.avatar,chosenSports:me.chosenSports,sports:me.sports});
  await page.reload();await expect(page.locator('.content')).toBeVisible();await expect(page.locator('.signup-recovery')).toHaveCount(0);
  expect(await page.evaluate(()=>sessionStorage.getItem('dwnc.signup-recovery.v1'))).toBeNull();
  await page.evaluate(id=>sessionStorage.setItem('dwnc.signup-recovery.v1',JSON.stringify({version:1,expiresAt:Date.now()+3600000,ownerId:id,region:'옛 지역',ageRange:'30대',chosenSports:['running']})),a);
  await signup(page,'second@example.test');await page.reload();await expect(page.locator('.content')).toBeVisible();await expect(page.locator('.signup-recovery')).toHaveCount(0);
  const next=await snapshot(page);expect(next.state.activeUserId).not.toBe(a);expect(next.state.users.find(person=>person.id===next.state.activeUserId).region).toBe('미설정');
  expect(await page.evaluate(()=>sessionStorage.getItem('dwnc.signup-recovery.v1'))).toBeNull();
});
test('disabled browser storage retains in-page onboarding retry and explains reload limitation',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Disabled','SecurityError');}}));
  await page.route('**/api/commands',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'허구 저장 오류'})}));
  await page.goto('/');await page.getByRole('button',{name:'처음이에요 · 회원가입'}).click();
  for(const [name,value] of Object.entries({name:'저장소 확인',region:'송파구',email:'storage@example.test',password,confirmPassword:password}))await page.locator(`#auth-form [name="${name}"]`).fill(value);
  await page.getByRole('button',{name:'회원가입',exact:true}).click();
  await expect(page.locator('.signup-recovery')).toContainText('새로고침 전에 다시 저장');
  await page.unroute('**/api/commands');await page.getByRole('button',{name:'가입 정보 다시 저장'}).click();await expect(page.locator('.signup-recovery')).toHaveCount(0);
  const current=await snapshot(page);expect(current.state.users.find(person=>person.id===current.state.activeUserId).region).toBe('송파구');
});
test('signup interrupted by initial state outage recovers the same account after reload',async({page})=>{
  let failState=false, signups=0;
  await page.route('**/api/state',route=>failState ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'허구 상태 조회 오류'})}) : route.continue());
  page.on('request',request=>{if(request.url().endsWith('/api/auth/sign-up/email'))signups++;});
  await page.goto('/');await page.getByRole('button',{name:'처음이에요 · 회원가입'}).click();
  for(const [name,value] of Object.entries({name:'연결 복구',region:'송파구',email:'outage@example.test',password,confirmPassword:password}))await page.locator(`#auth-form [name="${name}"]`).fill(value);
  await page.locator('#auth-form [name="ageRange"]').selectOption('40대');
  failState=true;await page.getByRole('button',{name:'회원가입',exact:true}).click();
  await expect(page.locator('.recovery')).toContainText('기록을 불러오지 못했어요');
  failState=false;const owner=(await snapshot(page)).state.activeUserId;
  await page.reload();await expect(page.locator('.signup-recovery')).toContainText('40대');
  await page.getByRole('button',{name:'가입 정보 다시 저장'}).click();await expect(page.locator('.signup-recovery')).toHaveCount(0);
  const current=await snapshot(page);expect(current.state.activeUserId).toBe(owner);expect(current.state.users.find(person=>person.id===owner).region).toBe('송파구');expect(signups).toBe(1);
});
test('revocation before opening chat clears the dialog and cannot keep a protected screen interactive',async({page})=>{
  await signup(page);const group=await command(page,'group.create',{name:'접근 확인',region:'송파구',description:'테스트'});
  await groupDetail(page,group.id);await page.request.post('/api/auth/sign-out',{headers:{Origin:origin},data:{}});
  await page.getByRole('button',{name:'그룹 채팅',exact:true}).click();
  await expect(page.locator('#auth-form')).toBeVisible();await expect(page.locator('.sheet')).toHaveCount(0);await expect(page.locator('.content')).toHaveCount(0);
  expect(await page.locator('#app').evaluate(node=>node.inert)).toBe(false);
});
test('chat duplicate submit sends once; browser back restores its draft and receive polling',async({page})=>{
  await signup(page);const group=await command(page,'group.create',{name:'뒤로가기 모임',region:'송파구',description:'테스트'});
  await groupDetail(page,group.id);await page.getByRole('button',{name:'그룹 채팅',exact:true}).click();
  await expect(page.locator('[data-chat-title]')).toHaveText('뒤로가기 모임');
  let writes=0;page.on('request',request=>{if(request.method()==='POST' && /\/messages$/.test(request.url()))writes++;});
  await page.locator('#chat-message-text').fill('중복 제출 확인');
  await page.locator('#chat-message-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await expect(page.locator('.chat-message p')).toHaveText('중복 제출 확인');expect(writes).toBe(1);
  await page.locator('#chat-message-text').fill('돌아와도 유지할 초안');
  await page.locator('.tabbar a[href="#/ranking"]').click();await expect(page.locator('.content[data-page="ranking"]')).toBeVisible();
  await page.goBack();await expect(page.locator('.chat-room-view')).toBeVisible();await expect(page.locator('#chat-message-text')).toHaveValue('돌아와도 유지할 초안');
  const current=await snapshot(page),roomId=new URLSearchParams((await page.evaluate(()=>location.hash)).split('?')[1]).get('room');
  const sent=await page.request.post(`/api/chats/${roomId}/messages`,{headers:{Origin:origin},data:{text:'외부 요청의 새 메시지',clientMessageId:randomUUID(),expectedUserId:current.state.activeUserId}});expect(sent.status()).toBe(200);
  await expect(page.locator('.chat-message p').last()).toHaveText('외부 요청의 새 메시지',{timeout:12000});await expect(page.locator('#chat-message-text')).toHaveValue('돌아와도 유지할 초안');
});
