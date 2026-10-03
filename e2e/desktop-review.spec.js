import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../dwnc-app/server.js';
import { LEVELS } from '../dwnc-app/domain.js';
import { koreaToday } from '../dwnc-app/clock.js';

const origin='http://127.0.0.1:4198';
let application;
test.use({baseURL:origin,reducedMotion:'reduce'});
test.beforeEach(async()=>{
  application=await createApplication({databasePath:':memory:',baseURL:origin,production:false});
  await new Promise(resolve=>application.server.listen(4198,'127.0.0.1',resolve));
});
test.afterEach(async()=>{await application?.close();});
async function snapshot(client){return (await client.get(`${origin}/api/state`)).json();}
async function signup(client,name,email){
  const result=await client.post(`${origin}/api/auth/sign-up/email`,{headers:{Origin:origin},data:{name,email,password:'Desktop-fictional-2026!'}});
  expect(result.status()).toBe(200);return snapshot(client);
}
async function command(client,type,payload){
  const current=await snapshot(client);
  const response=await client.post(`${origin}/api/commands`,{headers:{Origin:origin},data:{type,payload,revision:current.revision,expectedUserId:current.state.activeUserId,requestId:randomUUID()}});
  expect(response.status(),await response.text()).toBe(200);return response.json();
}
async function open(page,route){await page.goto(`/#/${route}`);await expect(page.locator('.content')).toBeVisible();await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');}

test('visible community refreshes peer membership without manual reload; long secondary content stays readable',async({page,browser},testInfo)=>{
  const owner=await signup(page.request,'모임장','desktop-owner@example.test');
  const peer=await browser.newContext();
  try{
    await signup(peer.request,'운동 친구','desktop-peer@example.test');
    const group=await command(page.request,'group.create',{name:'같이 뛰어요 서울 러닝 크루 토요일 저녁 운동',region:'서울 강남구',description:'긴 설명도 읽을 수 있도록 모임에서 함께하는 운동과 만나는 시간을 자세하게 적어 보아요.'});
    await open(page,'community?tab=groups');
    const card=page.locator(`.gcard[data-id="${group.id}"]`);
    await expect(card.locator('.stack .avatar')).toHaveCount(1);
    await command(peer.request,'group.join',{groupId:group.id});
    await expect(card.locator('.stack .avatar')).toHaveCount(2,{timeout:12000});
    const date=koreaToday(new Date(Date.now()+86400000*2));
    const match=await command(page.request,'match.create',{sport:'running',title:'한강에서 함께 달리는 편안한 주말 저녁 러닝',region:'서울 강남구',venue:'반포 한강공원 달빛광장 출발 지점',date,startTime:'19:00',endTime:'20:00',capacity:4,level:LEVELS[0],description:'천천히 뛰고 함께 몸을 풀어요.',format:'crew',visibility:'public'});
    for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:844});
      for(const route of ['matches','ranking','community?tab=groups','community?tab=chats','notifications']){
        await open(page,route);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
        expect(await page.locator('.shell').evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
        if(route==='matches'){
          const title=page.locator(`.schedule-section [data-id="${match.id}"] strong`);
          await expect(title).toHaveText('한강에서 함께 달리는 편안한 주말 저녁 러닝');
          expect(await title.evaluate(node=>getComputedStyle(node).whiteSpace)).toBe('normal');
        }
        if(route==='community?tab=chats')expect(await page.locator('.chat-view>.head h2').evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(40);
        await page.screenshot({path:testInfo.outputPath(`${width}-${route.replace(/[?=]/g,'-')}.png`),fullPage:true});
      }
    }
    expect(owner.state.activeUserId).toBeTruthy();
  }finally{await peer.close();}
});

test('home receives peer manner ratings and background refresh keeps the note draft and caret',async({page,browser})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const owner=await signup(page.request,'매너 확인','desktop-rating-owner@example.test');
  const peer=await browser.newContext();
  try{
    const other=await signup(peer.request,'평가 친구','desktop-rating-peer@example.test');
    const a=owner.state.activeUserId,b=other.state.activeUserId;
    const match=await command(page.request,'match.create',{sport:'tennis',title:'지난 테니스',region:'서울',venue:'허구 코트',date:koreaToday(new Date(Date.now()+86400000*2)),startTime:'10:00',endTime:'11:00',capacity:2,level:LEVELS[0],description:'평가 테스트',format:'singles',visibility:'public'});
    await command(peer.request,'match.apply',{matchId:match.id});
    await command(page.request,'match.decide',{matchId:match.id,applicantId:b,decision:'accepted'});
    // Move only this disposable fixture into the past; all result/rating writes use the real API.
    const stored=JSON.parse(application.db.prepare('SELECT payload FROM matches WHERE id=?').get(match.id).payload);
    stored.date=koreaToday(new Date(Date.now()-86400000));
    application.db.prepare('UPDATE matches SET payload=? WHERE id=?').run(JSON.stringify(stored),match.id);
    const proposal=await command(page.request,'result.save',{matchId:match.id,data:{attendedIds:[a,b],teamAIds:[a],scoreA:6,scoreB:4}});
    const result=proposal.state.resultProposals.find(item=>item.id===proposal.id);
    await command(peer.request,'result.decide',{proposalId:result.id,version:result.version,decision:'accepted'});
    await open(page,'home');
    const front=page.locator('.passport-front');
    await command(peer.request,'rating.save',{matchId:match.id,targetId:a,value:5});
    await expect(front).toContainText('5.0',{timeout:12000});
    const note=page.locator('#daily-note');await note.fill('입력 중인 한 줄은 보존');
    await note.evaluate(node=>node.setSelectionRange(4,4));
    const peerSnap=await snapshot(peer.request),me=peerSnap.state.users.find(user=>user.id===b);
    await command(peer.request,'profile.update',{name:'바뀐 친구',region:'서울',ageRange:me.ageRange,gender:me.gender,bio:me.bio,avatar:me.avatar,chosenSports:me.chosenSports,sports:me.sports});
    await page.waitForTimeout(5500);
    await expect(note).toHaveValue('입력 중인 한 줄은 보존');await expect(note).toBeFocused();
    expect(await note.evaluate(node=>node.selectionStart)).toBe(4);
    await page.getByRole('button',{name:'한 줄 저장'}).click();
    // Editing uses the original revision: the first stale save is rejected, then retried explicitly.
    await expect(page.locator('.toast.error')).toBeVisible();
    await expect(note).toHaveValue('입력 중인 한 줄은 보존');
    await page.getByRole('button',{name:'한 줄 저장'}).click();
    await expect.poll(async()=>(await snapshot(page.request)).state.dailyNotes[a]?.[koreaToday()]).toBe('입력 중인 한 줄은 보존');
    expect(errors).toEqual([]);
  }finally{await peer.close();}
});
