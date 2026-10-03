import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createApplication } from '../dwnc-app/server.js';
import { LEVELS, today } from '../dwnc-app/domain.js';

const password = 'Local-test-only-482!';
const secret = 'disposable-integration-test-secret-not-for-real-accounts';
async function fixture(t) {
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const directory = mkdtempSync(path.join(tmpdir(),'dwnc-api-'));
  const baseURL = `http://127.0.0.1:${port}`, databasePath = path.join(directory,'test.sqlite');
  let app;
  const start = async () => { app = await createApplication({databasePath,baseURL,secret}); await new Promise(resolve => app.server.listen(port,'127.0.0.1',resolve)); };
  await start();
  t.after(async () => { await app.close(); assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir())); rmSync(directory,{recursive:true,force:true}); });
  return { baseURL,get db() {return app.db;},async restart() {await app.close();await start();} };
}
function client(f) {
  const cookies = new Map();
  return {
    async req(url,body,extra = {}) {
      const response = await fetch(f.baseURL+url,{method:body === undefined ? 'GET' : 'POST',headers:{Origin:f.baseURL,
        ...(body === undefined ? {} : {'Content-Type':'application/json'}),Connection:'close',Cookie:[...cookies].map(([k,v]) => `${k}=${v}`).join('; '),...extra},body:body === undefined ? undefined : JSON.stringify(body)});
      const setCookies = response.headers.getSetCookie();
      for (const cookie of setCookies) { const [key,value] = cookie.split(';')[0].split('=');cookies.set(key,value); }
      const data = await response.json().catch(() => ({}));
      return {status:response.status,data,setCookies,headers:response.headers};
    },
    async signup(name,email) {
      const result = await this.req('/api/auth/sign-up/email',{name,email,password});
      assert.equal(result.status,200,JSON.stringify(result.data));
      assert.ok(result.setCookies.some(cookie => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
      return (await this.state()).state.activeUserId;
    },
    async state() {const r = await this.req('/api/state');assert.equal(r.status,200,JSON.stringify(r.data));return r.data;},
    async command(type,payload,expected = 200) {
      const {revision} = await this.state();
      const r = await this.req('/api/commands',{type,payload,revision,requestId:randomUUID()});
      assert.equal(r.status,expected,JSON.stringify(r.data));return r.data;
    },
  };
}
const matchInput = overrides => ({sport:'tennis',format:'singles',visibility:'public',title:'통합 QA 테니스',region:'관악구',venue:'QA 코트',date:today(),startTime:'00:00',endTime:'23:59',capacity:2,level:LEVELS[0],description:'허구의 로컬 테스트 운동',...overrides});

test('signup → shared matching/result → logout/login → database restart persists; password and session guards',async t => {
  const f = await fixture(t), alice = client(f), bob = client(f), outsider = client(f);
  assert.equal((await outsider.req('/api/state')).status,401);
  assert.equal((await outsider.req('/api/auth/sign-up/email',{name:'x',email:'bad',password:'short'})).status,400);
  const a = await alice.signup('QA 모집자','host@example.test'), b = await bob.signup('QA 참여자','player@example.test');
  await alice.command('note.save',{date:today(),text:'나만의 한 줄'});
  const created = await alice.command('match.create',matchInput());
  await bob.command('match.apply',{matchId:created.id});
  await bob.command('match.decide',{matchId:created.id,applicantId:b,decision:'accepted'},422);
  await bob.command('result.save',{matchId:created.id,data:{attendedIds:[a,b],teamAIds:[a],scoreA:6,scoreB:4}},422);
  await alice.command('match.decide',{matchId:created.id,applicantId:b,decision:'accepted'});
  await alice.command('result.save',{matchId:created.id,data:{attendedIds:[a,b],teamAIds:[a],scoreA:6,scoreB:4}});
  await bob.command('rating.save',{matchId:created.id,targetId:a,value:5});
  await bob.command('rating.save',{matchId:created.id,targetId:a,value:1},422);
  assert.equal((await bob.state()).state.results[0].matchId,created.id);
  assert.deepEqual((await bob.state()).state.dailyNotes,{[b]:{}});
  const snapshot = JSON.stringify((await bob.state()).state);
  assert.ok(!snapshot.includes('host@example.test') && !snapshot.includes(password) && !snapshot.includes('나만의 한 줄'));
  const hashes = f.db.prepare('SELECT password FROM account').all();
  assert.equal(hashes.length,2);assert.ok(hashes.every(row => row.password && row.password !== password && row.password.length > 80));
  assert.equal((await bob.req('/api/auth/sign-out',{})).status,200);
  assert.equal((await bob.req('/api/state')).status,401);
  assert.equal((await bob.req('/api/auth/sign-in/email',{email:'player@example.test',password:'wrong-password'})).status,401);
  assert.equal((await bob.req('/api/auth/sign-in/email',{email:'player@example.test',password})).status,200);
  assert.equal((await bob.state()).state.results.length,1);
  await f.restart();
  assert.equal((await bob.state()).state.results.length,1);
  assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n,1);
  await bob.req('/api/auth/sign-out',{});
  assert.equal((await bob.req('/api/auth/sign-in/email',{email:'player@example.test',password})).status,200);
  assert.equal((await bob.state()).state.results.length,1);
});

test('local migration/seed CLI is repeatable, protects existing data and refuses insecure production setup',async () => {
  const directory = mkdtempSync(path.join(tmpdir(),'dwnc-migration-'));
  try {
    const databasePath = path.join(directory,'test.sqlite');
    const run = action => spawnSync(process.execPath,['backend/manage.js',action],{encoding:'utf8',env:{...process.env,DATABASE_PATH:databasePath,NODE_ENV:'test'}});
    assert.equal(run('migrate').status,0);assert.equal(run('migrate').status,0);
    assert.equal(run('seed').status,0);assert.notEqual(run('seed').status,0);
    const app = await createApplication({databasePath,secret,production:false});
    try { assert.equal(app.db.prepare('SELECT count(*) AS n FROM profiles').get().n,4);assert.equal(app.db.prepare('SELECT count(*) AS n FROM user').get().n,0);assert.equal(app.db.prepare('PRAGMA foreign_key_check').all().length,0); }
    finally {app.db.close();}
    await assert.rejects(() => createApplication({databasePath:':memory:',production:true,secret:''}),/Production requires/);
    await assert.rejects(() => createApplication({databasePath:':memory:',production:true,secret,baseURL:'http://127.0.0.1:4174'}),/Production requires/);
  } finally {assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));rmSync(directory,{recursive:true,force:true});}
});

test('server ownership, private visibility, strict inputs, CSRF, optimistic conflicts and safe duplicate retries',async t => {
  const f = await fixture(t), alice = client(f), bob = client(f), carol = client(f);
  const a = await alice.signup('Private Host','private@example.test'), b = await bob.signup('Member','member@example.test');
  await carol.signup('Outsider','outsider@example.test');
  const g = await alice.command('group.create',{name:'허구 QA 그룹',region:'관악구',description:'공개 가입 그룹'});
  const privateMatch = await alice.command('match.create',matchInput({visibility:'group',groupId:g.id,title:'비공개 운동',venue:'비공개 장소'}));
  assert.equal((await bob.state()).state.matches.length,0);
  await bob.command('match.apply',{matchId:privateMatch.id},404);
  await bob.command('match.cancel',{matchId:privateMatch.id},404);
  await bob.command('group.join',{groupId:g.id});
  assert.equal((await bob.state()).state.matches.length,1);
  await bob.command('match.apply',{matchId:privateMatch.id});
  await alice.command('match.decide',{matchId:privateMatch.id,applicantId:b,decision:'accepted'});
  await alice.command('result.save',{matchId:privateMatch.id,data:{attendedIds:[a,b],teamAIds:[a],scoreA:6,scoreB:4}});
  const outsider = (await carol.state()).state;
  assert.equal(outsider.matches.length,0);assert.equal(outsider.results.length,0);
  assert.ok(!JSON.stringify(outsider).includes('비공개 장소'));
  const notice = (await alice.state()).state.notifications[0];
  await bob.command('notice.read',{noticeId:notice.id},422);
  await bob.command('note.save',{date:today(),text:'hijack',userId:a},400);
  const bobRevision = (await bob.state()).revision;
  assert.equal((await bob.req('/api/commands',{type:'note.save',payload:{date:today(),text:'stale account'},revision:bobRevision,requestId:randomUUID(),expectedUserId:a})).data.code,'SESSION_CHANGED');
  await bob.command('match.create',matchInput({capacity:100}),422);
  await bob.command('note.save',{date:'2026-02-30',text:'invalid'},422);
  const {revision} = await alice.state();
  const command = {type:'match.create',payload:matchInput({title:'한 번만 생성'}),revision,requestId:randomUUID()};
  assert.equal((await alice.req('/api/commands',command,{Origin:'https://evil.example'})).status,403);
  const first = await alice.req('/api/commands',command), second = await alice.req('/api/commands',command);
  assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.data.id,second.data.id);assert.equal(second.data.replayed,true);
  assert.equal((await alice.req('/api/commands',{...command,payload:matchInput({title:'변조 요청'})})).status,409);
  const current = await alice.state();
  const concurrent = [1,2].map(n => alice.req('/api/commands',{type:'note.save',payload:{date:today(),text:`concurrent-${n}`},revision:current.revision,requestId:randomUUID()}));
  const responses = await Promise.all(concurrent);assert.deepEqual(responses.map(r => r.status).sort(),[200,409]);
  await alice.command('friend.request',{code:(await bob.state()).state.users.find(u => u.id === b).friendCode});
  const req = (await bob.state()).state.friendRequests[0];
  await carol.command('friend.decide',{requestId:req.id,decision:'accepted'},422);
  await bob.command('friend.decide',{requestId:req.id,decision:'accepted'});
  const invMatch = await alice.command('match.create',matchInput({title:'친구 초대 운동'}));
  await alice.command('invitation.send',{matchId:invMatch.id,targetId:b});
  const inv = (await bob.state()).state.invitations[0];
  await carol.command('invitation.decide',{invitationId:inv.id,decision:'accepted'},422);
  await bob.command('invitation.decide',{invitationId:inv.id,decision:'accepted'});
  assert.equal((await bob.state()).state.matches.find(m => m.id === invMatch.id).applications[0].status,'accepted');
  for (const url of ['/server.js','/backend/auth.js','/package.json','/.env','/domain.test.js','/../data/dwnc.sqlite']) assert.equal((await bob.req(url)).status,404,url);
  const payload = {type:'note.save',payload:{date:today(),text:'x'.repeat(270000)},revision:0,requestId:randomUUID()};
  assert.equal((await bob.req('/api/commands',payload)).status,413);
  const liveSession = f.db.prepare('SELECT id FROM session LIMIT 1').get();
  f.db.prepare('UPDATE session SET expiresAt=? WHERE id=?').run(Date.now()-1000,liveSession.id);
  // Expire all sessions deterministically, then verify the protected entry point.
  f.db.prepare('UPDATE session SET expiresAt=?').run(Date.now()-1000);
  assert.equal((await alice.req('/api/state')).status,401);
});
