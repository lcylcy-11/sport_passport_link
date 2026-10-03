import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError, snapshot } from './commands.js';
import { readState, writeState, transaction } from './database.js';
import { makeMatch, saveResult } from '../dwnc-app/extended-domain.js';
import { koreaToday } from '../dwnc-app/clock.js';

const inputSchema=z.strictObject({action:z.enum(['add10','reset']),requestId:z.string().uuid(),expectedUserId:z.string().max(100).optional()});
export function demoUserIds(value=process.env.DEMO_USER_IDS || '') {return new Set(String(value).split(',').map(id=>id.trim()).filter(Boolean));}
export function demoSnapshot(db,actorId,allowed=demoUserIds()) {return {...snapshot(db,actorId),...(allowed.has(actorId)?{demoControls:true}:{})};}
const markerOwner=(match,actorId)=>match.id.startsWith('demo-record-') && match.demoGeneratedOwnerId===actorId && match.hostId===actorId && match.participantOnly===true && match.applications.length===0;
const dateBefore=(today,days)=>new Date(Date.parse(`${today}T00:00:00Z`)-days*86400000).toISOString().slice(0,10);

export function executeDemoRecords(db,actorId,input,{allowed=demoUserIds(),today=koreaToday()}={}) {
  if (!allowed.has(actorId)) throw new ApiError(403,'시연 계정에서만 사용할 수 있습니다.','DEMO_FORBIDDEN');
  const parsed=inputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400,'시연 요청 형식을 확인해 주세요.','INVALID_INPUT');
  const {action,requestId,expectedUserId}=parsed.data;
  if (expectedUserId && expectedUserId!==actorId) throw new ApiError(409,'다른 계정으로 변경되었습니다.','SESSION_CHANGED');
  const fingerprint=`demo:${createHash('sha256').update(action).digest('hex')}`;
  return transaction(db,()=>{
    const receipt=db.prepare('SELECT fingerprint FROM command_receipts WHERE user_id=? AND request_id=?').get(actorId,requestId);
    if (receipt) {
      if (receipt.fingerprint!==fingerprint) throw new ApiError(409,'같은 요청 번호에 다른 작업을 보낼 수 없습니다.','REQUEST_REUSED');
      return {...demoSnapshot(db,actorId,allowed),replayed:true};
    }
    let {state}=readState(db,actorId);
    if (action==='add10') {
      const owner=state.users.find(user=>user.id===actorId);
      if (!owner) throw new ApiError(404,'프로필을 찾을 수 없습니다.','NOT_FOUND');
      for (let index=0;index<10;index++) {
        const date=dateBefore(today,index);
        const made=makeMatch(state,actorId,{sport:'running',format:'crew',visibility:'friends',title:`시연 러닝 ${index+1}`,region:owner.region,venue:'시연 공원',date,startTime:'06:00',endTime:'06:30',capacity:2,level:'무관',description:'시연 계정 전용 5km 개인 러닝 기록'},date);
        state=made.state;
        const match=state.matches.find(item=>item.id===made.id);
        match.id=`demo-record-${createHash('sha256').update(actorId).digest('hex').slice(0,16)}-${requestId}-${index}`;
        match.participantOnly=true;match.demoGeneratedOwnerId=actorId;
        state=saveResult(state,match.id,actorId,{attendedIds:[actorId],entries:{[actorId]:{distanceKm:5,paceSec:360}},reviews:{[actorId]:'콩 성장과 운동 통계를 확인하는 시연 기록'}});
        state.results.find(result=>result.matchId===match.id).confirmation={status:'confirmed',confirmedAt:new Date().toISOString(),legacy:false};
      }
    } else {
      const ids=state.matches.filter(match=>markerOwner(match,actorId)).map(match=>match.id);
      // Delete only explicitly server-tagged fixtures. Preserve profiles, real
      // records, notes, friendships, and all other owners' demo records.
      for (const id of ids) {
        db.prepare('DELETE FROM ratings WHERE match_id=?').run(id);
        db.prepare('DELETE FROM result_proposals WHERE match_id=?').run(id);
        db.prepare('DELETE FROM results WHERE match_id=?').run(id);
        db.prepare('DELETE FROM invitations WHERE match_id=?').run(id);
        db.prepare('DELETE FROM applications WHERE match_id=?').run(id);
        db.prepare('DELETE FROM matches WHERE id=?').run(id);
      }
      state=readState(db,actorId).state;
    }
    writeState(db,state);
    db.prepare('INSERT INTO command_receipts VALUES (?,?,?,?,?)').run(actorId,requestId,fingerprint,null,Date.now());
    return demoSnapshot(db,actorId,allowed);
  });
}
