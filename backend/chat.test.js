import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase,migrateSports,readState,writeState,transaction } from './database.js';
import { createExtendedSeed } from '../dwnc-app/extended-domain.js';
import * as d from '../dwnc-app/extended-domain.js';
import * as collaboration from '../dwnc-app/collaboration-domain.js';
import { projectState } from './commands.js';

test('SQLite chat room ACL, durable dedup, cursor pages and independent sports revision',async () => {
 const c=await import('./chat.js').catch(()=>({})); assert.equal(typeof c.openRoom,'function');
 const db=openDatabase(':memory:');
 try {
  db.exec('CREATE TABLE user (id TEXT PRIMARY KEY)'); migrateSports(db); migrateSports(db);
  transaction(db,()=>writeState(db,createExtendedSeed())); const revision=readState(db).revision;
  const body={kind:'direct',peerId:'jihun',expectedUserId:'minseo',requestId:randomUUID()};
  const room=c.openRoom(db,'minseo',body).room; assert.equal(c.openRoom(db,'minseo',{...body,requestId:randomUUID()}).room.id,room.id);
  assert.throws(()=>c.openRoom(db,'minseo',{...body,peerId:'sua'}));
  assert.throws(()=>c.listMessages(db,'sua',room.id,{})); assert.throws(()=>c.sendMessage(db,'sua',room.id,{text:'x',clientMessageId:randomUUID(),expectedUserId:'sua'}));
  const send={text:'<함께> 운동해요',clientMessageId:randomUUID(),expectedUserId:'minseo'};
  const m=c.sendMessage(db,'minseo',room.id,send).message;
  assert.equal(c.sendMessage(db,'minseo',room.id,send).message.id,m.id);
  assert.throws(()=>c.sendMessage(db,'minseo',room.id,{...send,text:'변조'}));
  assert.throws(()=>c.sendMessage(db,'minseo',room.id,{...send,clientMessageId:randomUUID(),expectedUserId:'jihun'}));
  for(let i=0;i<104;i++) c.sendMessage(db,'jihun',room.id,{text:`메시지 ${i}`,clientMessageId:randomUUID(),expectedUserId:'jihun'});
  const latest=c.listMessages(db,'minseo',room.id,{}); assert.equal(latest.messages.length,100); assert.equal(latest.messages.at(-1).text,'메시지 103');
  const previous=c.listMessages(db,'minseo',room.id,{before:String(latest.messages[0].id),limit:'100'}); assert.equal(previous.messages.length,5);
  const after=c.listMessages(db,'minseo',room.id,{after:String(m.id),limit:'2'}); assert.deepEqual(after.messages.map(m=>m.text),['메시지 0','메시지 1']); assert.equal(after.hasMore,true);
  assert.throws(()=>c.listMessages(db,'minseo',room.id,{after:'bad'})); assert.throws(()=>c.listMessages(db,'minseo',room.id,{limit:'101'}));
  assert.equal(c.listRooms(db,'sua').rooms.length,0); assert.equal(c.listRooms(db,'minseo').rooms[0].lastMessage.text,'메시지 103');
  assert.equal(readState(db).revision,revision); assert.equal(db.prepare('SELECT count(*) n FROM chat_messages').get().n,105);
  const group=c.openRoom(db,'minseo',{kind:'group',groupId:'group-motion',expectedUserId:'minseo',requestId:randomUUID()}).room;
  assert.throws(()=>c.listMessages(db,'jihun',group.id,{})); assert.equal(c.listMessages(db,'sua',group.id,{}).messages.length,0);
  const match=c.openRoom(db,'minseo',{kind:'match',matchId:'today-tennis',expectedUserId:'minseo',requestId:randomUUID()}).room;
  assert.throws(()=>c.listMessages(db,'sua',match.id,{}));
  assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,2);
 } finally {db.close();}
});
test('public discovery and withdrawn participants cannot receive pending result proposal details',() => {
 const seed=createExtendedSeed(),made=collaboration.proposeResult(seed,'today-tennis','minseo',{attendedIds:['minseo','jihun'],teamAIds:['minseo'],scoreA:6,scoreB:4});
 assert.equal(projectState(made.state,'sua').resultProposals.length,0);
 const changed=collaboration.reconcileProposals(d.withdrawMatch(made.state,'today-tennis','minseo'));
 assert.equal(projectState(changed,'minseo').resultProposals.length,0);
});

test('appointment snapshots revoke match withdrawal and direct friendship access',() => {
 const seed=createExtendedSeed(),input={sport:'tennis',title:'비공개 변경안',region:'관악구',venue:'개인 코트',address:'비공개 상세 주소',date:'2099-10-03',startTime:'09:00',endTime:'10:00',description:'참가자만 확인',participantIds:['minseo','jihun']};
 const matchRoom={id:'match-room',kind:'match',matchId:'today-tennis',participantIds:input.participantIds};
 const made=collaboration.proposeAppointment(seed,matchRoom,'minseo',{...input,roomId:matchRoom.id,existingMatchId:'today-tennis'});
 const withdrawn=collaboration.reconcileProposals(d.withdrawMatch(made.state,'today-tennis','minseo'));
 assert.equal(collaboration.canAccessRoom(withdrawn,matchRoom,'minseo'),false);
 assert.equal(projectState(withdrawn,'minseo').appointmentProposals.length,0);
 const room={id:'direct-room',kind:'direct',participantIds:input.participantIds};
 const direct=collaboration.proposeAppointment(seed,room,'minseo',{...input,roomId:room.id});
 direct.state.friendRequests=[];
 assert.equal(collaboration.canAccessRoom(direct.state,room,'jihun'),false);
 assert.equal(projectState(direct.state,'jihun').appointmentProposals.length,0);
});
