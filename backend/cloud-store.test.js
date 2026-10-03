import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CloudStore, TABLES, exportCapsule, restoreCapsule, withCloudDatabase } from './cloud-store.js';
import { ensureProfile, snapshot, executeCommand } from './commands.js';
import { openRoom, sendMessage, listMessages } from './chat.js';
import { createCloudHandler } from '../api/index.js';

const url='https://fake-project.supabase.co',origin='https://sports.example.test';
const serviceKey='server-only-fake-key',anonKey='public-fake-key';
const actor={id:randomUUID(),name:'클라우드 테스트',email:'cloud@example.test'};
function remote() {
  let revision=0,capsule=null;
  const calls=[];
  const fetchImpl=async (input,options)=>{
    calls.push({input,options});
    const body=options.body?JSON.parse(options.body):{};
    if (input.endsWith('/dwnc_read_store')) return Response.json({revision,capsule:structuredClone(capsule)});
    if (input.endsWith('/dwnc_commit_store')) {
      if (body.p_expected_revision!==revision) return Response.json({committed:false,revision});
      capsule=structuredClone(body.p_capsule); revision++;
      return Response.json({committed:true,revision});
    }
    if (input.endsWith('/auth/v1/user')) return options.headers.Authorization==='Bearer valid-access'?Response.json({...actor,user_metadata:{name:actor.name},email_confirmed_at:'2026-10-01'}):Response.json({msg:'Invalid token'}, {status:401});
    if (input.endsWith('/auth/v1/token?grant_type=password') || input.endsWith('/auth/v1/signup')) return Response.json({access_token:'valid-access',refresh_token:'valid-refresh',expires_in:3600,user:actor});
    if (input.endsWith('/auth/v1/token?grant_type=refresh_token')) return body.refresh_token==='valid-refresh'?Response.json({access_token:'valid-access',refresh_token:'rotated-refresh',expires_in:3600,user:actor}):Response.json({msg:'Invalid refresh'}, {status:400});
    if (input.endsWith('/auth/v1/logout?scope=local')) return new Response(null,{status:204});
    throw new Error('Unexpected URL');
  };
  return {fetchImpl,calls,store:new CloudStore({url,serviceKey,fetchImpl}),get saved(){return {revision,capsule};}};
}
function provision(db,user=actor) {db.prepare('INSERT OR IGNORE INTO user(id) VALUES (?)').run(user.id);ensureProfile(db,user);}
async function invoke(handler,path,{method='GET',body,cookie='',requestOrigin=origin}={}) {
  const headers={cookie,origin:requestOrigin,...(body===undefined?{}:{'content-type':'application/json'})};
  const response={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(value){this.data=JSON.parse(value);}};
  await handler({url:path,method,headers,body},response);
  return response;
}
const command=(revision,type,payload,user=actor.id,requestId=randomUUID())=>({revision,type,payload,expectedUserId:user,requestId});

test('capsule contains only allowlisted domain tables and roundtrips persistent receipts',async()=>{
  const r=remote();
  const first=await withCloudDatabase(r.store,db=>{provision(db);return snapshot(db,actor.id);});
  const input=command(first.revision,'note.save',{date:'2026-10-03',text:'외부 저장 확인'});
  const saved=await withCloudDatabase(r.store,db=>executeCommand(db,actor.id,input));
  const db=restoreCapsule(r.saved.capsule);
  try {
    assert.deepEqual(TABLES,Object.keys(exportCapsule(db).tables));
    assert.deepEqual(snapshot(db,actor.id),{state:saved.state,revision:saved.revision});
    assert.equal(db.prepare('SELECT * FROM command_receipts').all().length,1);
    assert.equal(Object.hasOwn(exportCapsule(db).tables,'user'),false);
    assert.equal(Object.hasOwn(exportCapsule(db).tables,'session'),false);
  } finally {db.close();}
  const persistedRevision=r.saved.revision;
  const replay=await withCloudDatabase(r.store,db=>executeCommand(db,actor.id,input));
  assert.equal(replay.replayed,true);
  assert.equal(replay.revision,saved.revision);
  assert.equal(r.saved.revision,persistedRevision,'read/replay must not cause a cloud write');
});

test('concurrent capsules use CAS: losing response rejects and never overwrites a persisted command',async()=>{
  const r=remote();
  const first=await withCloudDatabase(r.store,db=>{provision(db);return snapshot(db,actor.id);});
  const [a,b]=await Promise.allSettled([
    withCloudDatabase(r.store,db=>executeCommand(db,actor.id,command(first.revision,'note.save',{date:'2026-10-01',text:'A'}))),
    withCloudDatabase(r.store,db=>executeCommand(db,actor.id,command(first.revision,'note.save',{date:'2026-10-02',text:'B'}))),
  ]);
  assert.equal(a.status,'fulfilled');assert.equal(b.status,'rejected');assert.equal(b.reason.status,409);
  const db=restoreCapsule(r.saved.capsule);
  try {assert.deepEqual(snapshot(db,actor.id).state.dailyNotes[actor.id],{'2026-10-01':'A'});assert.equal(db.prepare('SELECT count(*) AS n FROM command_receipts').get().n,1);}finally{db.close();}
});

test('group chat and message UUID dedup survive new invocations without incrementing sports revision',async()=>{
  const r=remote();
  const initial=await withCloudDatabase(r.store,db=>{provision(db);return snapshot(db,actor.id);});
  const group=await withCloudDatabase(r.store,db=>executeCommand(db,actor.id,command(initial.revision,'group.create',{name:'영속 그룹',region:'서울',description:'테스트'})));
  const room=await withCloudDatabase(r.store,db=>openRoom(db,actor.id,{kind:'group',groupId:group.id,expectedUserId:actor.id,requestId:randomUUID()}));
  const messageInput={text:'첫 메시지',expectedUserId:actor.id,clientMessageId:randomUUID()};
  const sent=await withCloudDatabase(r.store,db=>sendMessage(db,actor.id,room.room.id,messageInput));
  const replay=await withCloudDatabase(r.store,db=>sendMessage(db,actor.id,room.room.id,messageInput));
  assert.deepEqual(sent,replay);
  const state=await withCloudDatabase(r.store,db=>snapshot(db,actor.id));assert.equal(state.revision,group.revision);
  const messages=await withCloudDatabase(r.store,db=>listMessages(db,actor.id,room.room.id));
  assert.equal(messages.messages.length,1);assert.equal(messages.messages[0].text,'첫 메시지');
  await assert.rejects(withCloudDatabase(r.store,db=>sendMessage(db,randomUUID(),room.room.id,{...messageInput,expectedUserId:randomUUID()})),error=>error.status===409);
});

test('corrupt, unexpected credential tables and invalid foreign keys fail closed',()=>{
  assert.throws(()=>restoreCapsule({version:1,tables:{user:[]}}),error=>error.status===503);
  const db=restoreCapsule();let capsule;
  try{provision(db);capsule=exportCapsule(db);}finally{db.close();}
  assert.throws(()=>restoreCapsule({...capsule,passwords:[]}),error=>error.status===503);
  capsule.tables.group_members.push({group_id:'missing',user_id:actor.id});
  assert.throws(()=>restoreCapsule(capsule),error=>error.status===503);
});

test('every persisted table roundtrips populated rows including proposals, ratings and independent chat cursors',()=>{
  const db=restoreCapsule(),peer={id:randomUUID(),name:'상대'};
  let capsule;
  try {
    provision(db);provision(db,peer);
    db.prepare('INSERT INTO groups VALUES (?,?,?)').run('g',actor.id,'{}');
    db.prepare('INSERT INTO group_members VALUES (?,?)').run('g',peer.id);
    db.prepare('INSERT INTO matches VALUES (?,?,?,?,?)').run('m',actor.id,'g','group','{}');
    db.prepare('INSERT INTO applications VALUES (?,?,?,?)').run('m',peer.id,'accepted','{}');
    db.prepare('INSERT INTO results VALUES (?,?,?)').run('m',actor.id,'{}');
    db.prepare('INSERT INTO friend_requests VALUES (?,?,?,?)').run('f',actor.id,peer.id,'{}');
    db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?)').run('i','m',actor.id,peer.id,'{}');
    db.prepare('INSERT INTO notifications VALUES (?,?,?)').run('n',peer.id,'{}');
    db.prepare('INSERT INTO daily_notes VALUES (?,?,?)').run(actor.id,'2026-10-03','특수문자 < > &');
    db.prepare('INSERT INTO ratings VALUES (?,?,?,?)').run('m',actor.id,peer.id,5);
    db.prepare('INSERT INTO command_receipts VALUES (?,?,?,?,?)').run(actor.id,randomUUID(),'fingerprint','m',Date.now());
    db.prepare('INSERT INTO chat_rooms VALUES (?,?,?,?)').run('room','context','{}','2026-10-03');
    db.prepare('INSERT INTO chat_messages VALUES (?,?,?,?,?,?)').run(51,'room',actor.id,randomUUID(),'한글 채팅','2026-10-03');
    db.prepare('INSERT INTO appointment_proposals VALUES (?,?,?,?)').run('appointment','room',actor.id,'{}');
    db.prepare('INSERT INTO result_proposals VALUES (?,?,?,?)').run('result-proposal','m',actor.id,'{}');
    capsule=exportCapsule(db);
  } finally {db.close();}
  const restored=restoreCapsule(capsule);
  try {
    assert.deepEqual(exportCapsule(restored),capsule);
    assert.ok(TABLES.every(table=>capsule.tables[table].length>0));
    const made=restored.prepare('INSERT INTO chat_messages(room_id,sender_id,client_message_id,text,created_at) VALUES (?,?,?,?,?)').run('room',actor.id,randomUUID(),'다음 메시지','2026-10-03');
    assert.equal(made.lastInsertRowid,52);
  }finally{restored.close();}
});

test('HTTPS config and server-only RPC credentials are enforced',async()=>{
  assert.throws(()=>new CloudStore({url:'http://example.test',serviceKey}));
  assert.throws(()=>createCloudHandler({origin:'https://sports.example.test/path',url,anonKey,serviceKey}));
  const r=remote();await r.store.read();
  assert.equal(r.calls[0].options.headers.apikey,serviceKey);
  assert.equal(r.calls[0].options.headers.Authorization,`Bearer ${serviceKey}`);
  const bad=new CloudStore({url,serviceKey,fetchImpl:async()=>Response.json({message:'private diagnostic'}, {status:500})});
  await assert.rejects(bad.read(),error=>error.status===503 && !error.message.includes('diagnostic'));
});

test('cloud HTTP API verifies auth remotely, rejects forged tokens and origin attacks, preserves private data',async()=>{
  const r=remote(),handler=createCloudHandler({origin,url,anonKey,serviceKey,fetchImpl:r.fetchImpl});
  const forged=await invoke(handler,'/api/state',{cookie:'__Host-dwnc-access=forged'});assert.equal(forged.statusCode,401);assert.equal(r.saved.revision,0);
  const wrongOrigin=await invoke(handler,'/api/auth/sign-in/email',{method:'POST',requestOrigin:'https://attacker.test',body:{email:actor.email,password:'Strong-test-123!'}});assert.equal(wrongOrigin.statusCode,403);
  const signin=await invoke(handler,'/api/auth/sign-in/email',{method:'POST',body:{email:actor.email,password:'Strong-test-123!'}});
  assert.equal(signin.statusCode,200);assert.equal(signin.data.user.id,actor.id);assert.equal(Object.hasOwn(signin.data,'access_token'),false);
  assert.ok(signin.headers['set-cookie'].every(cookie=>/HttpOnly; Secure; SameSite=Lax/.test(cookie)));
  const state=await invoke(handler,'/api/state',{cookie:'__Host-dwnc-access=valid-access'});
  assert.equal(state.statusCode,200);assert.equal(state.data.state.activeUserId,actor.id);
  const save=await invoke(handler,'/api/commands',{method:'POST',cookie:'__Host-dwnc-access=valid-access',body:command(state.data.revision,'note.save',{date:'2026-10-03',text:'지속'})});assert.equal(save.statusCode,200);
  const reload=await invoke(handler,'/api/state',{cookie:'__Host-dwnc-access=valid-access'});assert.equal(reload.data.state.dailyNotes[actor.id]['2026-10-03'],'지속');
  const oversized=await invoke(handler,'/api/commands',{method:'POST',cookie:'__Host-dwnc-access=valid-access',body:{text:'a'.repeat(262144)}});assert.equal(oversized.statusCode,413);
  const anonymous=await invoke(handler,'/api/chats');assert.equal(anonymous.statusCode,401);
  assert.ok(r.calls.filter(call=>call.input.includes('/auth/v1/')).every(call=>call.options.headers.apikey===anonKey));
});

test('refresh rotates secure cookies and validates the replacement token before granting a session',async()=>{
  const r=remote(),handler=createCloudHandler({origin,url,anonKey,serviceKey,fetchImpl:r.fetchImpl});
  const refreshed=await invoke(handler,'/api/auth/get-session',{cookie:'__Host-dwnc-access=expired; __Host-dwnc-refresh=valid-refresh'});
  assert.equal(refreshed.statusCode,200);assert.equal(refreshed.data.user.id,actor.id);assert.ok(refreshed.headers['set-cookie'].some(cookie=>cookie.includes('rotated-refresh')));
  assert.ok(r.calls.some(call=>call.input.endsWith('/auth/v1/user')&&call.options.headers.Authorization==='Bearer valid-access'));
  const expired=await invoke(handler,'/api/state',{cookie:'__Host-dwnc-access=expired; __Host-dwnc-refresh=invalid'});assert.equal(expired.statusCode,401);
  const logout=await invoke(handler,'/api/auth/sign-out',{method:'POST',cookie:'__Host-dwnc-access=valid-access',body:{}});assert.equal(logout.statusCode,200);assert.ok(logout.headers['set-cookie'].every(cookie=>cookie.includes('Max-Age=0')));
});

test('demo HTTP mutations enforce configured actor and Origin and persist retry receipts atomically',async()=>{
  const r=remote(),handler=createCloudHandler({origin,url,anonKey,serviceKey,fetchImpl:r.fetchImpl,demoIds:new Set([actor.id])}),cookie='__Host-dwnc-access=valid-access';
  const before=await invoke(handler,'/api/state',{cookie});assert.equal(before.data.demoControls,true);
  const body={action:'add10',requestId:randomUUID()},saved=await invoke(handler,'/api/demo/records',{method:'POST',cookie,body});
  assert.equal(saved.statusCode,200);assert.equal(saved.data.state.results.length,10);assert.equal(saved.data.revision,before.data.revision+1);
  const replay=await invoke(handler,'/api/demo/records',{method:'POST',cookie,body});assert.equal(replay.data.replayed,true);assert.equal(replay.data.revision,saved.data.revision);
  const foreignOrigin=await invoke(handler,'/api/demo/records',{method:'POST',cookie,body,requestOrigin:'https://foreign.test'});assert.equal(foreignOrigin.statusCode,403);
  const disabled=createCloudHandler({origin,url,anonKey,serviceKey,fetchImpl:r.fetchImpl,demoIds:new Set()});
  const noMarker=await invoke(disabled,'/api/state',{cookie});assert.equal(Object.hasOwn(noMarker.data,'demoControls'),false);
  const forbidden=await invoke(disabled,'/api/demo/records',{method:'POST',cookie,body:{action:'reset',requestId:randomUUID()}});assert.equal(forbidden.statusCode,403);
  const reset=await invoke(handler,'/api/demo/records',{method:'POST',cookie,body:{action:'reset',requestId:randomUUID()}});assert.equal(reset.statusCode,200);assert.equal(reset.data.state.results.length,0);
});
