import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import * as d from '../dwnc-app/extended-domain.js';
import * as base from '../dwnc-app/domain.js';
import { readState, writeState, transaction } from './database.js';

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const id = z.string().min(1).max(100);
const text = max => z.string().trim().max(max);
const sport = z.enum(base.SPORTS);
const numeric = z.union([z.string().max(16),z.number().finite()]);
const ids = z.array(id).max(20);
const decision = z.enum(['accepted','rejected']);
const sportsProfile = z.strictObject({ experience: text(40), level: z.enum(base.LEVELS), preference: text(40), ntrp: text(3).optional() });
const commonProfile = {
  name: text(24).min(1), region: text(30).min(1), ageRange: text(20).min(1), gender: text(20), bio: text(180),
  avatar: z.enum(d.AVATARS), chosenSports: z.array(sport).min(1).max(3),
};
const schemas = {
  'profile.update': z.strictObject({ ...commonProfile, sports: z.partialRecord(sport,sportsProfile) }),
  'profile.photo': z.strictObject({ photo: z.string().max(200000).nullable() }),
  'note.save': z.strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), text: text(140) }),
  'match.create': z.strictObject({ sport, title: text(60).min(1), region: text(30).min(1), venue: text(60).min(1), date: text(10),
    startTime: text(5), endTime: text(5), capacity: numeric, level: z.enum(base.LEVELS), description: text(500).min(1),
    format: z.enum(['singles','doubles','team','crew']), visibility: z.enum(d.VISIBILITY), groupId: text(100).nullable().optional() }),
  'match.apply': z.strictObject({ matchId: id }), 'match.withdraw': z.strictObject({ matchId: id }), 'match.cancel': z.strictObject({ matchId: id }),
  'match.decide': z.strictObject({ matchId: id, applicantId: id, decision }),
  'result.save': z.strictObject({ matchId: id, data: z.strictObject({ attendedIds: ids,
    noContest: z.boolean().optional(), teamAIds: ids.optional(), scoreA: numeric.optional(), scoreB: numeric.optional(),
    scoreFor: numeric.optional(), scoreAgainst: numeric.optional(), mvpUserId: id.optional(), positions: z.record(id,text(30)).optional(),
    entries: z.record(id,z.strictObject({distanceKm: numeric,paceSec: numeric})).optional(), reviews: z.record(id,text(160)).optional() }) }),
  'rating.save': z.strictObject({ matchId: id, targetId: id, value: numeric }),
  'friend.request': z.strictObject({ code: text(40).min(1) }),
  'friend.decide': z.strictObject({ requestId: id, decision }),
  'group.create': z.strictObject({ name: text(40).min(1), region: text(30).min(1), description: text(300) }),
  'group.join': z.strictObject({ groupId: id }),
  'invitation.send': z.strictObject({ matchId: id, targetId: id }),
  'invitation.decide': z.strictObject({ invitationId: id, decision: z.enum(['accepted','declined']) }),
  'notice.read': z.strictObject({ noticeId: id }), 'notice.readAll': z.strictObject({}),
};
const envelope = z.strictObject({ type: z.enum(Object.keys(schemas)), payload: z.unknown(), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), expectedUserId: id.optional() });

export function ensureProfile(db, authUser) {
  if (db.prepare('SELECT id FROM profiles WHERE auth_user_id=?').get(authUser.id)) return;
  transaction(db, () => {
    const { state } = readState(db);
    const created = d.createDemoUser(state, { name: authUser.name.trim().slice(0,24) || '운동 친구', region: '미설정', ageRange: '미입력', gender: '미입력', bio: '', avatar: d.AVATARS[0], chosenSports: [...base.SPORTS] });
    const user = created.state.users.find(u => u.id === created.id);
    user.id = authUser.id; user.friendCode = `DWNC-${randomUUID().slice(0,18).toUpperCase()}`;
    created.state.activeUserId = user.id;
    writeState(db,created.state);
    db.prepare('UPDATE profiles SET auth_user_id=? WHERE id=?').run(authUser.id,authUser.id);
  });
}

export function projectState(state, actorId) {
  const view = structuredClone(state);
  view.activeUserId = actorId;
  view.matches = state.matches.filter(m => d.canViewMatch(state,m,actorId)).map(m => ({ ...structuredClone(m),
    applications: m.applications.filter(a => m.hostId === actorId || a.userId === actorId || a.status === 'accepted') }));
  const visible = new Set(view.matches.map(m => m.id));
  view.results = view.results.filter(r => visible.has(r.matchId));
  view.friendRequests = view.friendRequests.filter(r => r.fromId === actorId || r.toId === actorId);
  view.invitations = view.invitations.filter(r => (r.fromId === actorId || r.toId === actorId) && visible.has(r.matchId));
  view.notifications = view.notifications.filter(n => n.userId === actorId);
  view.dailyNotes = { [actorId]: view.dailyNotes[actorId] || {} };
  // Aggregate manner is public profile information; individual private ratings are not.
  view.users = view.users.map(u => ({ ...u, publicManner: d.mannerFor(state,u.id) }));
  view.ratings = view.ratings.filter(r => r.fromId === actorId && visible.has(r.matchId));
  return view;
}

export function snapshot(db, actorId) {
  const { state, revision } = readState(db,actorId);
  return { state: projectState(state,actorId), revision };
}

export function executeCommand(db, actorId, input) {
  const parsed = envelope.safeParse(input);
  if (!parsed.success) throw new ApiError(400,'요청 형식을 확인해 주세요.','INVALID_INPUT');
  const command = parsed.data;
  if (command.expectedUserId && command.expectedUserId !== actorId) throw new ApiError(409,'다른 계정으로 변경되었습니다. 내용을 다시 확인해 주세요.','SESSION_CHANGED');
  const payload = schemas[command.type].safeParse(command.payload);
  if (!payload.success) throw new ApiError(400,'입력 항목과 길이를 확인해 주세요.','INVALID_INPUT');
  const p = payload.data;
  const fingerprint = createHash('sha256').update(JSON.stringify({type:command.type,payload:p})).digest('hex');
  return transaction(db, () => {
    const receipt = db.prepare('SELECT fingerprint, result_id FROM command_receipts WHERE user_id=? AND request_id=?').get(actorId,command.requestId);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new ApiError(409,'같은 요청 번호에 다른 작업을 보낼 수 없습니다.','REQUEST_REUSED');
      return { ...snapshot(db,actorId), id: receipt.result_id, replayed: true };
    }
    const { state, revision } = readState(db,actorId);
    if (command.revision !== revision) throw new ApiError(409,'다른 변경이 있습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.','REVISION_CONFLICT');
    if (p.matchId && !d.canViewMatch(state,base.getMatch(state,p.matchId),actorId)) throw new ApiError(404,'운동 자리를 찾을 수 없습니다.','NOT_FOUND');
    let next, resultId = null;
    switch (command.type) {
      case 'profile.update': next = d.editProfile(state,actorId,p); break;
      case 'profile.photo': next = d.setProfilePhoto(state,actorId,p.photo); break;
      case 'note.save': next = d.setDailyNote(state,actorId,p.date,p.text); break;
      case 'match.create': { const made = d.makeMatch(state,actorId,p); next = made.state; resultId = made.id; break; }
      case 'match.apply': next = d.requestMatch(state,p.matchId,actorId); break;
      case 'match.decide': next = d.decideMatchRequest(state,p.matchId,actorId,p.applicantId,p.decision); break;
      case 'match.withdraw': next = d.withdrawMatch(state,p.matchId,actorId); break;
      case 'match.cancel': next = d.cancelMatch(state,p.matchId,actorId); break;
      case 'result.save': next = d.saveResult(state,p.matchId,actorId,p.data); break;
      case 'rating.save': next = d.rateParticipant(state,p.matchId,actorId,p.targetId,p.value); break;
      case 'friend.request': next = d.sendFriendRequest(state,actorId,p.code); break;
      case 'friend.decide': next = d.decideFriendRequest(state,p.requestId,actorId,p.decision); break;
      case 'group.create': { const made = d.createGroup(state,actorId,p); next = made.state; resultId = made.id; break; }
      case 'group.join': next = d.joinGroup(state,p.groupId,actorId); break;
      case 'invitation.send': next = d.inviteToMatch(state,p.matchId,actorId,p.targetId); break;
      case 'invitation.decide': next = d.decideInvitation(state,p.invitationId,actorId,p.decision); break;
      case 'notice.read': next = d.markNoticeRead(state,p.noticeId,actorId); break;
      case 'notice.readAll': next = d.markAllNoticesRead(state,actorId); break;
    }
    writeState(db,d.reconcileRequests(next));
    db.prepare('INSERT INTO command_receipts VALUES (?, ?, ?, ?, ?)').run(actorId,command.requestId,fingerprint,resultId,Date.now());
    db.prepare('DELETE FROM command_receipts WHERE created_at < ?').run(Date.now()-7*24*60*60*1000);
    return { ...snapshot(db,actorId), id: resultId };
  });
}
