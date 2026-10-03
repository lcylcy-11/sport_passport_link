import * as base from './domain.js';
import * as d from './extended-domain.js';

const fail = message => { throw new base.DomainError(message); };
const clone = state => { const next=structuredClone(state); next.appointmentProposals ||= []; next.resultProposals ||= []; return next; };
const same = (a,b) => a.length===b.length && a.every(id=>b.includes(id));
const matchOf = (state,id) => state.matches.find(m=>m.id===id);
const stamp = match => JSON.stringify([match.sport,match.title,match.region,match.venue,match.address||'',match.date,match.startTime,match.endTime,match.description,match.format,match.visibility,match.groupId,match.participantOnly||false,base.participants(match)]);
const idFor = (state,prefix) => `${prefix}-${state.nextId++}`;
const validMatch = (state,proposal) => { const match=matchOf(state,proposal.matchId||proposal.details?.existingMatchId); return match && match.status==='open' && !base.isCompleted(state,match.id) && same(base.participants(match),proposal.participantIds) && stamp(match)===proposal.originalMatch; };

export function canAccessRoom(state,room,actorId) {
 if (!room || !state.users.some(u=>u.id===actorId)) return false;
 if (room.kind==='direct') return room.participantIds.includes(actorId) && room.participantIds.length===2 && d.friendsOf(state,actorId).includes(room.participantIds.find(id=>id!==actorId));
 if (room.kind==='group') return Boolean(state.groups.find(g=>g.id===room.groupId)?.memberIds.includes(actorId));
 if (room.kind==='match') return Boolean(matchOf(state,room.matchId) && base.participants(matchOf(state,room.matchId)).includes(actorId));
 return false;
}
export function roomParticipants(state,room) {
 if (room.kind==='group') return [...(state.groups.find(g=>g.id===room.groupId)?.memberIds||[])];
 if (room.kind==='match') return matchOf(state,room.matchId) ? base.participants(matchOf(state,room.matchId)) : [];
 return [...room.participantIds];
}
export function reconcileProposals(state) {
 const next=clone(state);
 for (const proposal of next.resultProposals) if (proposal.status==='pending' && !validMatch(next,proposal)) proposal.status='invalid';
 for (const proposal of next.appointmentProposals) if (proposal.status==='pending') {
  if (proposal.details.existingMatchId && !validMatch(next,proposal)) proposal.status='invalid';
  else if (proposal.groupId && !proposal.participantIds.every(id=>next.groups.find(g=>g.id===proposal.groupId)?.memberIds.includes(id))) proposal.status='invalid';
  else if (proposal.roomKind==='direct' && !d.friendsOf(next,proposal.participantIds[0]).includes(proposal.participantIds[1])) proposal.status='invalid';
 }
 return next;
}
function decisionTarget(proposals,id,actorId,version,decision) {
 const proposal=proposals.find(p=>p.id===id);
 if (!proposal || !proposal.participantIds.includes(actorId) || proposal.version!==version || !['accepted','rejected'].includes(decision)) fail('제안 버전과 참가 권한을 확인해 주세요.');
 if (proposal.status==='confirmed' && decision==='accepted' && proposal.approvedIds.includes(actorId)) return proposal;
 if (proposal.status!=='pending') fail('변경되거나 종료된 제안입니다. 최신 내용을 확인해 주세요.');
 return proposal;
}
function vote(proposal,actorId,decision) {
 if (decision==='rejected') { proposal.status='rejected'; return false; }
 if (!proposal.approvedIds.includes(actorId)) proposal.approvedIds.push(actorId);
 return proposal.participantIds.every(id=>proposal.approvedIds.includes(id));
}
function confirmResult(state,proposal) {
 if (!validMatch(state,proposal)) fail('일정 또는 참가자가 변경되었습니다. 기록을 다시 제안해 주세요.');
 const finalized=d.saveResult(state,proposal.matchId,proposal.proposedBy,proposal.data);
 const p=finalized.resultProposals.find(p=>p.id===proposal.id); p.status='confirmed'; p.confirmedAt=new Date().toISOString();
 finalized.results.find(r=>r.matchId===p.matchId).confirmation={status:'confirmed',confirmedAt:p.confirmedAt,legacy:false};
 return finalized;
}
export function proposeResult(state,matchId,actorId,data) {
 let next=reconcileProposals(state); const match=matchOf(next,matchId);
 if (match?.agreedParticipantIds && !same(base.participants(match),match.agreedParticipantIds)) fail('합의한 참가자가 변경되었습니다. 기존 약속을 취소하고 새로운 약속을 함께 합의해 주세요.');
 // Reuse the canonical sport validator on a disposable clone. Nothing is inserted yet.
 d.saveResult(next,matchId,actorId,data);
 if (match.sport==='tennis' && data.noContest && new Set(data.attendedIds).size===match.capacity) fail('모든 경기 인원이 참석했다면 미성립 대신 팀과 점수를 확인해 주세요.');
 if (!data.attendedIds?.includes(actorId)) fail('제안자는 실제 참석자에 포함되어야 합니다.');
 const prior=next.resultProposals.filter(p=>p.matchId===matchId);
 for (const p of prior) if (p.status==='pending') p.status='superseded';
 const id=idFor(next,'result-proposal'), participantIds=base.participants(match);
 const proposal={id,version:Math.max(0,...prior.map(p=>p.version))+1,matchId,proposedBy:actorId,participantIds,approvedIds:[actorId],status:'pending',createdAt:new Date().toISOString(),data:structuredClone(data),originalMatch:stamp(match)};
 next.resultProposals.push(proposal);
 if (participantIds.length===1 && (match.sport==='running' || match.sport==='tennis' && data.noContest===true)) next=confirmResult(next,proposal);
 return {state:next,id};
}
export function decideResult(state,proposalId,actorId,version,decision) {
 const next=reconcileProposals(state), p=decisionTarget(next.resultProposals,proposalId,actorId,version,decision);
 if (p.status==='confirmed') return next;
 return vote(p,actorId,decision) ? confirmResult(next,p) : next;
}
function appointmentInput(state,room,actorId,input) {
 if (!canAccessRoom(state,room,actorId)) fail('이 대화방에 접근할 수 없습니다.');
 const participantIds=[...new Set(input.participantIds||[])], allowed=roomParticipants(state,room);
 if (participantIds.length<2 || !participantIds.includes(actorId) || participantIds.some(id=>!allowed.includes(id))) fail('제안자를 포함한 참가자를 선택해 주세요.');
 if (room.kind!=='group' && !same(participantIds,allowed)) fail('이 대화의 확정 참가자 전원이 함께 동의해야 합니다.');
 const count=participantIds.length, sport=input.sport;
 if (sport==='tennis' && ![2,4].includes(count) || sport==='futsal' && count>12 || sport==='running' && count>20) fail('종목에 맞는 참가 인원을 선택해 주세요.');
 const existingMatchId=input.existingMatchId;
 if (room.kind==='match' ? existingMatchId!==room.matchId : Boolean(existingMatchId)) fail('일정 변경은 해당 운동 대화에서만 가능합니다.');
 const original=existingMatchId ? matchOf(state,existingMatchId) : null;
 if (original && (original.status!=='open' || base.isCompleted(state,original.id) || sport!==original.sport || !same(base.participants(original),participantIds))) fail('완료되거나 변경된 운동은 다시 합의할 수 없습니다.');
 if (original?.agreedParticipantIds && !same(participantIds,original.agreedParticipantIds)) fail('합의한 참가자가 변경되었습니다. 기존 약속을 취소하고 새로운 약속을 함께 합의해 주세요.');
 const details=Object.fromEntries(['sport','title','region','venue','address','date','startTime','endTime','description'].map(key=>[key,String(input[key]??'').trim()]));
 if (existingMatchId) details.existingMatchId=existingMatchId;
 if (details.address.length>200) fail('주소는 200자 이내로 적어 주세요.');
 const matchData={...details,description:details.description||'함께 합의한 운동',capacity:count,format:sport==='tennis' ? count===4 ? 'doubles':'singles' : sport==='running' ? 'crew':'team',level:original?.level||'무관',visibility:original?.visibility||(room.kind==='group'?'group':'friends'),groupId:original?.groupId||(room.kind==='group'?room.groupId:null)};
 d.makeMatch(state,original?.hostId||actorId,matchData);
 return {participantIds,details,matchData,original};
}
export function proposeAppointment(state,room,actorId,input) {
 const next=reconcileProposals(state), checked=appointmentInput(next,room,actorId,input);
 if (input.replacesId && !next.appointmentProposals.some(p=>p.id===input.replacesId && p.roomId===room.id && p.status==='pending')) fail('이미 변경되거나 종료된 제안입니다. 최신 제안에서 변경해 주세요.');
 const prior=next.appointmentProposals.filter(p=>p.roomId===room.id && (input.replacesId ? p.id===input.replacesId || p.lineageId===input.replacesId : p.status==='pending'));
 if (input.replacesId && !prior.length) fail('변경할 제안을 찾을 수 없습니다.');
 for (const p of prior) if (p.status==='pending') p.status='superseded';
 const id=idFor(next,'appointment-proposal');
 next.appointmentProposals.push({id,version:Math.max(0,...prior.map(p=>p.version))+1,roomId:room.id,roomKind:room.kind,groupId:room.kind==='group'?room.groupId:null,proposedBy:actorId,participantIds:checked.participantIds,approvedIds:[actorId],status:'pending',createdAt:new Date().toISOString(),details:checked.details,originalMatch:checked.original ? stamp(checked.original) : null,lineageId:prior[0]?.lineageId||prior[0]?.id||id});
 return {state:next,id};
}
export function decideAppointment(state,room,proposalId,actorId,version,decision,now=new Date()) {
 let next=reconcileProposals(state);
 if (!canAccessRoom(next,room,actorId)) fail('이 대화방에 접근할 수 없습니다.');
 let p=decisionTarget(next.appointmentProposals,proposalId,actorId,version,decision);
 if (p.roomId!==room.id) fail('제안의 대화방을 확인해 주세요.');
 if (p.status==='confirmed' || !vote(p,actorId,decision)) return next;
 const checked=appointmentInput(next,room,p.proposedBy,{...p.details,participantIds:p.participantIds});
 const start=Date.parse(`${p.details.date}T${p.details.startTime}:00+09:00`);
 if (start<=now.getTime()) fail('지난 시작 시간입니다. 새로운 시간을 제안해 주세요.');
 for (const match of next.matches) if (match.id!==p.details.existingMatchId && match.status==='open' && !base.isCompleted(next,match.id) && match.date===p.details.date && match.startTime<p.details.endTime && p.details.startTime<match.endTime && base.participants(match).some(id=>p.participantIds.includes(id))) fail('참가자의 확정 일정과 겹칩니다. 다른 시간을 제안해 주세요.');
 let match;
 if (checked.original) {
  match=matchOf(next,checked.original.id); Object.assign(match,checked.details);
  for (const a of match.applications) if (a.status==='pending') { a.status='expired'; a.closedReason='일정 변경'; }
  for (const i of next.invitations) if (i.matchId===match.id && i.status==='pending') i.status='expired';
 } else {
  const made=d.makeMatch(next,p.proposedBy,checked.matchData); next=made.state; p=next.appointmentProposals.find(item=>item.id===proposalId); match=matchOf(next,made.id);
  match.applications=p.participantIds.filter(id=>id!==match.hostId).map(userId=>({userId,status:'accepted'}));
  match.participantOnly=room.kind==='direct'; match.recruitmentClosed=true; match.agreedParticipantIds=[...p.participantIds]; match.address=p.details.address;
 }
 match.location={label:match.venue,address:match.address||'',region:match.region,latitude:null,longitude:null,placeId:null,provider:null};
 p.status='confirmed'; p.matchId=match.id;
 return reconcileProposals(next);
}
