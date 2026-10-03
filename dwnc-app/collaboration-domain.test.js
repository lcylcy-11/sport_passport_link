import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from './extended-domain.js';
import * as base from './domain.js';

const input = { sport:'running',format:'crew',visibility:'public',title:'합의 러닝',region:'관악구',venue:'공원',date:'2099-10-03',startTime:'09:00',endTime:'10:00',capacity:3,level:'입문',description:'함께 달려요' };
async function api() { return import('./collaboration-domain.js').catch(() => ({})); }
function fixture() { const seed = d.createExtendedSeed('2099-10-03'); const made=d.makeMatch(seed,'minseo',input); const match=base.getMatch(made.state,made.id); match.applications=[{userId:'jihun',status:'accepted'},{userId:'sua',status:'accepted'}]; return made; }
const data={attendedIds:['minseo','jihun'],entries:{minseo:{distanceKm:3,paceSec:360},jihun:{distanceKm:4,paceSec:330}}};

test('result stays outside totals until all scheduled people approve, including absent participant',async () => {
 const c=await api(); assert.equal(typeof c.proposeResult,'function');
 const f=fixture(), before=d.statsFor(f.state,'minseo').running.runs;
 const p=c.proposeResult(f.state,f.id,'minseo',data), proposal=p.state.resultProposals.at(-1);
 assert.deepEqual(proposal.participantIds,['minseo','jihun','sua']);
 assert.equal(p.state.results.length,f.state.results.length); assert.equal(d.statsFor(p.state,'minseo').running.runs,before);
 assert.throws(()=>d.rateParticipant(p.state,f.id,'minseo','jihun',5));
 let next=c.decideResult(p.state,proposal.id,'jihun',1,'accepted'); assert.equal(next.results.length,f.state.results.length);
 next=c.decideResult(next,proposal.id,'sua',1,'accepted');
 assert.equal(next.results.length,f.state.results.length+1); assert.equal(d.statsFor(next,'minseo').running.runs,before+1);
 assert.equal(next.results.at(-1).confirmation.status,'confirmed');
 assert.equal(c.decideResult(next,proposal.id,'sua',1,'accepted').results.length,next.results.length);
});
test('immutable result versions reset votes; rejection, cancellation and roster changes invalidate',async () => {
 const c=await api(); assert.equal(typeof c.proposeResult,'function'); const f=fixture();
 let p=c.proposeResult(f.state,f.id,'minseo',data); const old=p.id;
 p=c.proposeResult(p.state,f.id,'jihun',data); assert.equal(p.state.resultProposals[0].status,'superseded');
 assert.equal(p.state.resultProposals.at(-1).version,2); assert.deepEqual(p.state.resultProposals.at(-1).approvedIds,['jihun']);
 assert.throws(()=>c.decideResult(p.state,old,'sua',1,'accepted'));
 const rejected=c.decideResult(p.state,p.id,'sua',2,'rejected'); assert.equal(rejected.resultProposals.at(-1).status,'rejected');
 assert.throws(()=>c.decideResult(rejected,p.id,'minseo',2,'accepted'));
 const changed=d.withdrawMatch(p.state,f.id,'sua'); assert.equal(c.reconcileProposals(changed).resultProposals.at(-1).status,'invalid');
 assert.equal(c.reconcileProposals(d.cancelMatch(p.state,f.id,'minseo')).resultProposals.at(-1).status,'invalid');
 assert.throws(()=>c.proposeResult(f.state,f.id,'sua',data));
});
test('existing host-only accepted running finalizes immediately but attendance omission does not',async () => {
 const c=await api(); assert.equal(typeof c.proposeResult,'function'); const f=fixture(); base.getMatch(f.state,f.id).applications=[];
 const made=c.proposeResult(f.state,f.id,'minseo',{attendedIds:['minseo'],entries:{minseo:{distanceKm:2,paceSec:400}}});
 assert.equal(made.state.results.at(-1).matchId,f.id);
});
test('existing host-only tennis no-contest confirms its complete roster; omitted peer still must approve',async () => {
 const c=await api(),f=fixture(),match=base.getMatch(f.state,f.id); match.sport='tennis'; match.format='singles'; match.capacity=2; match.applications=[];
 let p=c.proposeResult(f.state,f.id,'minseo',{attendedIds:['minseo'],noContest:true});
 assert.equal(p.state.resultProposals.at(-1).status,'confirmed'); assert.equal(p.state.results.at(-1).noContest,true);
 match.applications=[{userId:'jihun',status:'accepted'}]; p=c.proposeResult(f.state,f.id,'minseo',{attendedIds:['minseo'],noContest:true});
 assert.equal(p.state.resultProposals.at(-1).status,'pending'); assert.deepEqual(p.state.resultProposals.at(-1).participantIds,['minseo','jihun']);
});

test('full tennis roster cannot approve no-contest text that would save a competitive result',async () => {
 const c=await api(),f=fixture(),match=base.getMatch(f.state,f.id);
 match.sport='tennis'; match.format='singles'; match.capacity=2; match.applications=[{userId:'jihun',status:'accepted'}];
 assert.throws(()=>c.proposeResult(f.state,f.id,'minseo',{attendedIds:['minseo','jihun'],noContest:true,teamAIds:['minseo'],scoreA:6,scoreB:4}),/미성립/);
 assert.equal(f.state.resultProposals?.length||0,0);
});
test('direct appointment closes visibility, validates counts and converts once; own-match reschedule is allowed',async () => {
 const c=await api(); assert.equal(typeof c.proposeAppointment,'function'); const seed=d.createExtendedSeed('2099-10-03');
 const room={id:'room-direct',kind:'direct',participantIds:['minseo','jihun']};
 let p=c.proposeAppointment(seed,room,'minseo',{...input,roomId:room.id,participantIds:room.participantIds,address:'서울 공원'});
 let next=c.decideAppointment(p.state,room,p.id,'jihun',1,'accepted'); const proposal=next.appointmentProposals.at(-1), match=base.getMatch(next,proposal.matchId);
 assert.equal(match.participantOnly,true); assert.equal(match.recruitmentClosed,true); assert.deepEqual(base.participants(match),['minseo','jihun']);
 assert.equal(d.canViewMatch(next,match,'sua'),false); assert.equal(d.canRequestMatch(next,match,'sua'),false);
 assert.equal(c.decideAppointment(next,room,p.id,'jihun',1,'accepted').matches.length,next.matches.length);
 const matchRoom={id:'room-match',kind:'match',matchId:match.id,participantIds:base.participants(match)};
 p=c.proposeAppointment(next,matchRoom,'minseo',{...input,roomId:matchRoom.id,participantIds:matchRoom.participantIds,existingMatchId:match.id,address:'새 주소'});
 next=c.decideAppointment(p.state,matchRoom,p.id,'jihun',1,'accepted'); assert.equal(next.matches.length,p.state.matches.length); assert.equal(base.getMatch(next,match.id).address,'새 주소');
 const groupRoom={id:'group',kind:'group',groupId:'group-motion',participantIds:['minseo','sua','jihun']};
 assert.throws(()=>c.proposeAppointment(seed,groupRoom,'minseo',{...input,sport:'tennis',participantIds:groupRoom.participantIds}));
});
test('manner uses actual votes and empty average, without baseline',() => {
 const state=d.createExtendedSeed(); assert.equal(d.mannerFor(state,'minseo'),0);
 assert.deepEqual(d.mannerSummaryFor(state,'minseo'),{average:null,count:0});
 state.ratings=[{toId:'minseo',value:2},{toId:'minseo',value:5}]; assert.deepEqual(d.mannerSummaryFor(state,'minseo'),{average:3.5,count:2});
});
test('rescheduling expires prior applicant consent and permits a fresh application; conflicts reject atomically',async () => {
 const c=await api(),f=fixture(),match=base.getMatch(f.state,f.id); match.capacity=4; match.applications=[{userId:'jihun',status:'accepted'},{userId:'sua',status:'pending'}];
 f.state.invitations.push({id:'old-invite',matchId:f.id,fromId:'minseo',toId:'hyunwoo',status:'pending'});
 const room={id:'reschedule-room',kind:'match',matchId:f.id,participantIds:base.participants(match)};
 let p=c.proposeAppointment(f.state,room,'minseo',{...input,existingMatchId:f.id,participantIds:room.participantIds,startTime:'09:15',endTime:'10:15'});
 let changed=d.reconcileRequests(c.decideAppointment(p.state,room,p.id,'jihun',1,'accepted'));
 assert.equal(base.getMatch(changed,f.id).applications.find(a=>a.userId==='sua').status,'expired');
 assert.equal(changed.invitations.at(-1).status,'expired');
 assert.throws(()=>d.decideMatchRequest(changed,f.id,'minseo','sua','accepted'));
 assert.equal(d.canRequestMatch(changed,base.getMatch(changed,f.id),'sua'),true);
 changed=d.requestMatch(changed,f.id,'sua'); assert.equal(base.getMatch(changed,f.id).applications.find(a=>a.userId==='sua').status,'pending');
 const conflict=d.makeMatch(changed,'jihun',{...input,title:'다른 확정 일정',startTime:'11:00',endTime:'12:00'});
 p=c.proposeAppointment(conflict.state,room,'minseo',{...input,existingMatchId:f.id,participantIds:room.participantIds,startTime:'11:30',endTime:'12:30'});
 assert.throws(()=>c.decideAppointment(p.state,room,p.id,'jihun',1,'accepted'));
 assert.deepEqual(p.state.appointmentProposals.at(-1).approvedIds,['minseo']);
});
test('canonical proposal validation rejects forged roster/vote/status/version containers',async () => {
 const c=await api(),f=fixture(),p=c.proposeResult(f.state,f.id,'minseo',data);
 assert.equal(d.validateV2(p.state),true);
 for(const mutate of [s=>s.resultProposals={},s=>s.resultProposals[0].approvedIds.push('hyunwoo'),s=>s.resultProposals[0].version=0,s=>s.resultProposals[0].status='accepted',s=>s.resultProposals[0].participantIds.push('minseo')]) {
  const malformed=structuredClone(p.state); mutate(malformed); assert.equal(d.validateV2(malformed),false);
 }
});
test('closed agreed appointment cannot become automatic solo record after withdrawal; stale edits cannot fork versions',async () => {
 const c=await api(),seed=d.createExtendedSeed('2099-10-03'),room={id:'direct',kind:'direct',participantIds:['minseo','jihun']};
 const appointment={...input,roomId:room.id,participantIds:room.participantIds};
 const first=c.proposeAppointment(seed,room,'minseo',appointment),edited=c.proposeAppointment(first.state,room,'jihun',{...appointment,replacesId:first.id});
 assert.throws(()=>c.proposeAppointment(edited.state,room,'minseo',{...appointment,replacesId:first.id}));
 const agreed=c.decideAppointment(edited.state,room,edited.id,'minseo',2,'accepted'),match=base.getMatch(agreed,agreed.appointmentProposals.at(-1).matchId);
 const withdrawn=d.withdrawMatch(agreed,match.id,'minseo');
 assert.throws(()=>c.proposeResult(withdrawn,match.id,'jihun',{attendedIds:['jihun'],entries:{jihun:{distanceKm:3,paceSec:300}}}));
});
