import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { restoreCapsule, exportCapsule } from './cloud-store.js';
import { ensureProfile, snapshot } from './commands.js';
import { executeDemoRecords, demoSnapshot, demoUserIds } from './demo-controls.js';
import { deriveKongProfile } from '../dwnc-app/kong-profile.js';
import { homeWorkoutStats } from '../dwnc-app/home-summary.js';
import { makeMatch, saveResult } from '../dwnc-app/extended-domain.js';
import { readState, writeState } from './database.js';

const today='2026-10-03';
function fixture(t) {
  const db=restoreCapsule(),actor={id:randomUUID(),name:'시연'},other={id:randomUUID(),name:'실제 사용자'};
  for (const user of [actor,other]) {db.prepare('INSERT INTO user(id) VALUES (?)').run(user.id);ensureProfile(db,user);}
  t.after(()=>db.close());
  return {db,actor,other,allowed:new Set([actor.id]),today};
}
const add=requestId=>({action:'add10',requestId:requestId || randomUUID()});
const reset=()=>({action:'reset',requestId:randomUUID()});

test('add10 changes canonical Kong and profile stats together, exactly once, while retaining private visibility',t=>{
  const f=fixture(t),before=snapshot(f.db,f.actor.id),input=add();
  const result=executeDemoRecords(f.db,f.actor.id,input,f);
  assert.equal(result.demoControls,true);assert.equal(result.revision,before.revision+1);
  const kong=deriveKongProfile(result.state,f.actor.id,today),stats=homeWorkoutStats(result.state,f.actor.id,today);
  assert.equal(kong.total,10);assert.equal(kong.recent14,10);assert.equal(kong.stageIndex,1);assert.equal(kong.conditionIndex,3);
  assert.equal(stats.running.runs,10);assert.equal(stats.running.distanceKm,50);assert.equal(stats.tennis.games,0);assert.equal(stats.futsal.games,0);
  assert.equal(result.state.results.every(record=>record.confirmation.status==='confirmed'),true);
  const replay=executeDemoRecords(f.db,f.actor.id,input,f);assert.equal(replay.replayed,true);assert.equal(replay.revision,result.revision);
  const visitor=demoSnapshot(f.db,f.other.id,f.allowed);assert.equal(visitor.state.matches.length,0);assert.equal(visitor.state.results.length,0);assert.equal(Object.hasOwn(visitor,'demoControls'),false);
  assert.throws(()=>executeDemoRecords(f.db,f.actor.id,{...input,action:'reset'},f),error=>error.code==='REQUEST_REUSED');
});

test('reset returns an empty demo owner to zero and preserves peer records and profile fields',t=>{
  const f=fixture(t);executeDemoRecords(f.db,f.actor.id,add(),f);
  const peerOptions={...f,allowed:new Set([f.other.id])};executeDemoRecords(f.db,f.other.id,add(),peerOptions);
  const profiles=readState(f.db).state.users,peerBefore=snapshot(f.db,f.other.id);
  const result=executeDemoRecords(f.db,f.actor.id,reset(),f);
  assert.equal(deriveKongProfile(result.state,f.actor.id,today).total,0);assert.equal(homeWorkoutStats(result.state,f.actor.id,today).running.distanceKm,0);
  assert.deepEqual(readState(f.db).state.users,profiles);assert.deepEqual(snapshot(f.db,f.other.id).state.results,peerBefore.state.results);
  assert.equal(readState(f.db).state.results.length,10);
});

test('reset preserves existing owner real records and receipts survive independent capsule restoration',t=>{
  const f=fixture(t);let {state}=readState(f.db,f.actor.id);
  const real=makeMatch(state,f.actor.id,{sport:'running',format:'crew',visibility:'friends',title:'기존 기록',region:'서울',venue:'실제 공원',date:today,startTime:'06:00',endTime:'06:30',capacity:2,level:'무관',description:'기존 개인 운동'},today);
  state=saveResult(real.state,real.id,f.actor.id,{attendedIds:[f.actor.id],entries:{[f.actor.id]:{distanceKm:3,paceSec:400}},reviews:{}});writeState(f.db,state);
  const request=add();executeDemoRecords(f.db,f.actor.id,request,f);
  const independent=restoreCapsule(exportCapsule(f.db));
  try {
    assert.equal(executeDemoRecords(independent,f.actor.id,request,f).replayed,true);
    const input=reset(),result=executeDemoRecords(independent,f.actor.id,input,f);
    assert.equal(result.state.results.length,1);assert.equal(result.state.results[0].matchId,real.id);assert.equal(homeWorkoutStats(result.state,f.actor.id,today).running.distanceKm,3);
    assert.equal(executeDemoRecords(independent,f.actor.id,input,f).replayed,true);
    assert.equal(executeDemoRecords(independent,f.actor.id,request,f).replayed,true,'old add replay after reset must not resurrect fixtures');
    assert.equal(snapshot(independent,f.actor.id).state.results.length,1);
  }finally{independent.close();}
});

test('allowlist, account changes and malformed requests reject without changing revisions',t=>{
  const f=fixture(t),before=snapshot(f.db,f.actor.id).revision;
  assert.throws(()=>executeDemoRecords(f.db,f.other.id,add(),f),error=>error.status===403);
  assert.throws(()=>executeDemoRecords(f.db,f.actor.id,{...add(),expectedUserId:f.other.id},f),error=>error.code==='SESSION_CHANGED');
  assert.throws(()=>executeDemoRecords(f.db,f.actor.id,{action:'reset',requestId:'not-a-uuid'},f),error=>error.status===400);
  assert.throws(()=>executeDemoRecords(f.db,f.actor.id,{...add(),userId:f.other.id},f),error=>error.status===400);
  assert.equal(snapshot(f.db,f.actor.id).revision,before);
  assert.equal(demoUserIds('').size,0);assert.deepEqual([...demoUserIds(` ${f.actor.id},, ${f.other.id} `)],[f.actor.id,f.other.id]);
});
