import test, { mock } from 'node:test';
mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-30T10:00:00') });
import assert from 'node:assert/strict';
import * as v1 from './domain.js';
import * as d from './extended-domain.js';

const day = '2026-09-30';
const matchData = { sport: 'tennis', format: 'singles', title: '오늘 저녁 랠리', region: '관악구', venue: '관악 코트', date: day, startTime: '20:00', endTime: '21:00', capacity: 2, level: '중급', description: '같이 쳐요', visibility: 'public' };
const error = (fn, message) => assert.throws(fn, { name: 'DomainError', message });

test('v1 migration is idempotent on read and preserves edits, IDs, results, and safe allocation', () => {
  let legacy = v1.createSeed(day);
  legacy = v1.updateProfile(legacy, 'jihun', { bio: '<함께> 라켓을 들어요', sports: { tennis: { experience: '5년', level: '상급', preference: '단식', ntrp: '4.0' } } });
  const created = v1.createMatch(legacy, 'minseo', matchData, day); legacy = created.state;
  legacy.nextId = 1;
  const migrated = d.migrateV1(legacy);
  assert.equal(d.validateV2(migrated), true);
  assert.equal(migrated.users.find((u) => u.id === 'jihun').bio, '<함께> 라켓을 들어요');
  assert.equal(migrated.users.find((u) => u.id === 'jihun').sports.tennis.ntrp, '4.0');
  assert.equal(migrated.matches.length, legacy.matches.length);
  assert.equal(migrated.results.length, legacy.results.length);
  assert.equal(d.statsFor(migrated, 'minseo').tennis.wins, v1.statsFor(legacy, 'minseo').tennis.wins);
  const next = d.makeMatch(migrated, 'minseo', { ...matchData, title: '다음 경기' }, day);
  assert.notEqual(next.id, created.id);
  assert.equal(d.validateV2(next.state), true);
  assert.equal(d.validateV2(structuredClone(migrated)), true);
});

test('malformed old and new data are rejected before render or migration', () => {
  const old = v1.createSeed(day); old.results[0].entries.minseo.distanceKm = 201;
  error(() => d.migrateV1(old), '이전 데모 데이터가 손상되어 자동 이전할 수 없습니다.');
  const state = d.createExtendedSeed(day);
  assert.equal(d.validateV2(state), true);
  const bad = structuredClone(state); bad.results[0].entries.sua.paceSec = -1;
  assert.equal(d.validateV2(bad), false);
  const nullMatch = structuredClone(state); nullMatch.matches = [null];
  assert.equal(d.validateV2(nullMatch), false);
  const badTeam = structuredClone(state); badTeam.results.find((r) => r.sport === 'tennis').teams = ['minseo', ['jihun']];
  assert.equal(d.validateV2(badTeam), false);
});

test('onboarding and chosen sports create stable profile and friend code', () => {
  const state = d.createExtendedSeed(day);
  const created = d.createDemoUser(state, { name: '이하나', region: '관악구', ageRange: '20대', gender: '여성', bio: '달려요', avatar: '✳', chosenSports: ['running'] });
  const user = created.state.users.find((item) => item.id === created.id);
  assert.deepEqual(user.chosenSports, ['running']);
  assert.equal(user.friendCode.startsWith('DWNC-U'), true);
  assert.equal(d.validateV2(created.state), true);
  const edited = d.editProfile(created.state, created.id, { avatar: '◎', chosenSports: ['running', 'tennis'] });
  assert.equal(edited.users.find((item) => item.id === created.id).friendCode, user.friendCode);
  assert.equal(state.users.length, 4);
  const withPhoto = d.setProfilePhoto(edited, created.id, 'data:image/png;base64,aGVsbG8=');
  assert.equal(d.validateV2(withPhoto), true);
  error(() => d.setProfilePhoto(withPhoto, created.id, 'data:image/svg+xml;base64,PHN2Zz4='), '프로필 사진 형식이나 크기를 확인해 주세요.');
});

test('friend request, accept, visibility, invite and accepted schedule are enforced in domain', () => {
  let state = d.createExtendedSeed(day);
  const hidden = d.makeMatch(state, 'minseo', { ...matchData, visibility: 'friends' }, day); state = hidden.state;
  assert.equal(d.canViewMatch(state, state.matches[0], 'sua'), false);
  error(() => d.requestMatch(state, hidden.id, 'sua'), '볼 수 없는 운동 자리입니다.');
  state = d.sendFriendRequest(state, 'sua', state.users.find((u) => u.id === 'minseo').friendCode);
  const friendId = state.friendRequests.at(-1).id;
  error(() => d.decideFriendRequest(state, friendId, 'jihun', 'accepted'), '처리할 수 없는 친구 신청입니다.');
  state = d.decideFriendRequest(state, friendId, 'minseo', 'accepted');
  assert.equal(d.canViewMatch(state, state.matches[0], 'sua'), true);
  state = d.inviteToMatch(state, hidden.id, 'minseo', 'sua');
  const inviteId = state.invitations.at(-1).id;
  error(() => d.decideInvitation(state, inviteId, 'jihun', 'accepted'), '처리할 수 없는 운동 초대입니다.');
  state = d.decideInvitation(state, inviteId, 'sua', 'accepted');
  assert.equal(d.activityFor(state, 'sua', day).some((item) => item.match.id === hidden.id), true);
  assert.equal(v1.openSeats(state.matches[0]), 0);
  assert.equal(d.validateV2(state), true);
});

test('doubles no-contest validates when fewer than four were accepted; rejected applicant cannot receive unusable invite', () => {
  let state = d.createExtendedSeed(day);
  const made = d.makeMatch(state, 'minseo', { ...matchData, format: 'doubles', capacity: 4 }, day); state = made.state;
  for (const id of ['jihun', 'sua']) { state = d.requestMatch(state, made.id, id); state = d.decideMatchRequest(state, made.id, 'minseo', id, 'accepted'); }
  state = d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'jihun', 'sua'], noContest: true });
  assert.equal(d.validateV2(state), true);
  const made2 = d.makeMatch(state, 'minseo', { ...matchData, title: '초대 점검' }, day); state = made2.state;
  state = d.requestMatch(state, made2.id, 'jihun'); state = d.decideMatchRequest(state, made2.id, 'minseo', 'jihun', 'rejected');
  error(() => d.inviteToMatch(state, made2.id, 'minseo', 'jihun'), '이 친구를 해당 운동에 초대할 수 없습니다.');
});

test('group-only match is hidden outside members, group schedule and unique team games stay scoped', () => {
  let state = d.createExtendedSeed(day);
  const groupId = state.groups[0].id;
  const made = d.makeMatch(state, 'minseo', { ...matchData, sport: 'futsal', format: 'team', capacity: 3, visibility: 'group', groupId }, day); state = made.state;
  assert.equal(d.canViewMatch(state, state.matches[0], 'jihun'), false);
  error(() => d.requestMatch(state, made.id, 'jihun'), '볼 수 없는 운동 자리입니다.');
  state = d.joinGroup(state, groupId, 'jihun');
  assert.equal(d.canViewMatch(state, state.matches[0], 'jihun'), true);
  state = d.requestMatch(state, made.id, 'sua');
  state = d.decideMatchRequest(state, made.id, 'minseo', 'sua', 'accepted');
  state = d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'sua'], scoreFor: 3, scoreAgainst: 2, mvpUserId: 'sua', positions: { minseo: '윙', sua: '수비' } });
  assert.equal(d.groupSummary(state, groupId).futsalGames, 1);
  assert.equal(d.groupSummary(state, groupId).futsalWinRate, 100);
  assert.equal(d.ranking(state, 'futsal', { groupId })[0].user.id, 'sua');
  assert.equal(d.validateV2(state), true);
});

test('doubles teams cannot overlap; score and attendance drive only present players stats', () => {
  let state = d.createExtendedSeed(day);
  const made = d.makeMatch(state, 'minseo', { ...matchData, format: 'doubles', capacity: 4 }, day); state = made.state;
  for (const id of ['jihun', 'sua', 'hyunwoo']) { state = d.requestMatch(state, made.id, id); state = d.decideMatchRequest(state, made.id, 'minseo', id, 'accepted'); }
  error(() => d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'jihun', 'sua', 'hyunwoo'], teamAIds: ['minseo', 'minseo'], scoreA: 6, scoreB: 4 }), '두 팀의 참가자를 겹치지 않게 선택해 주세요.');
  error(() => d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'jihun', 'sua'], teamAIds: ['minseo', 'jihun'], scoreA: 6, scoreB: 4 }), '테니스 경기 인원이 부족합니다. 경기 미성립으로 기록해 주세요.');
  state = d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'jihun', 'sua', 'hyunwoo'], teamAIds: ['minseo', 'jihun'], scoreA: 6, scoreB: 4 });
  assert.equal(d.statsFor(state, 'minseo').tennis.wins, 2);
  assert.equal(d.statsFor(state, 'sua').tennis.losses, 1);
  error(() => d.saveResult(state, made.id, 'minseo', {}), '결과를 입력할 수 없는 운동입니다.');
  const made2 = d.makeMatch(state, 'minseo', { ...matchData, format: 'doubles', capacity: 4, title: '경기 미성립' }, day); state = made2.state;
  for (const id of ['jihun', 'sua', 'hyunwoo']) { state = d.requestMatch(state, made2.id, id); state = d.decideMatchRequest(state, made2.id, 'minseo', id, 'accepted'); }
  const before = d.statsFor(state, 'minseo').tennis.games;
  state = d.saveResult(state, made2.id, 'minseo', { attendedIds: ['minseo', 'jihun', 'sua'], noContest: true });
  assert.equal(d.statsFor(state, 'minseo').tennis.games, before);
  assert.equal(d.validateV2(state), true);
});

test('absent users get no futsal/running stats or MVP/rating rights; manner blends baseline with peer ratings', () => {
  let state = d.createExtendedSeed(day);
  const made = d.makeMatch(state, 'minseo', { ...matchData, sport: 'futsal', format: 'team', capacity: 3 }, day); state = made.state;
  for (const id of ['jihun', 'sua']) { state = d.requestMatch(state, made.id, id); state = d.decideMatchRequest(state, made.id, 'minseo', id, 'accepted'); }
  error(() => d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'jihun'], scoreFor: 2, scoreAgainst: 1, mvpUserId: 'sua', positions: { minseo: '윙', jihun: '수비' } }), '실제 참가자 중 MVP를 선택해 주세요.');
  state = d.saveResult(state, made.id, 'minseo', { attendedIds: ['minseo', 'jihun'], scoreFor: 2, scoreAgainst: 1, mvpUserId: 'jihun', positions: { minseo: '윙', jihun: '수비' } });
  assert.equal(d.statsFor(state, 'sua').futsal.games, 0);
  error(() => d.rateParticipant(state, made.id, 'sua', 'jihun', 5), '실제 함께 운동한 다른 참가자에게 1~5점을 남길 수 있습니다.');
  state = d.rateParticipant(state, made.id, 'minseo', 'jihun', 5);
  assert.equal(d.mannerFor(state, 'jihun'), Math.round((4.8 * 5 + 5) / 6 * 10) / 10);
  error(() => d.rateParticipant(state, made.id, 'minseo', 'jihun', 4), '이미 이 참가자를 평가했습니다.');
  const running = d.makeMatch(state, 'minseo', { ...matchData, sport: 'running', format: 'crew', capacity: 3 }, day); state = running.state;
  for (const id of ['jihun', 'sua']) { state = d.requestMatch(state, running.id, id); state = d.decideMatchRequest(state, running.id, 'minseo', id, 'accepted'); }
  state = d.saveResult(state, running.id, 'minseo', { attendedIds: ['minseo', 'jihun'], entries: { minseo: { distanceKm: 5, paceSec: 300 }, jihun: { distanceKm: 4, paceSec: 330 } }, reviews: { minseo: '상쾌해요', jihun: '좋아요' } });
  assert.equal(d.statsFor(state, 'sua').running.runs, 1);
  assert.equal(d.validateV2(state), true);
});

test('cancel, withdraw, notifications, month rankings and daily note are bounded', () => {
  let state = d.createExtendedSeed(day);
  const made = d.makeMatch(state, 'minseo', matchData, day); state = made.state;
  state = d.requestMatch(state, made.id, 'jihun');
  state = d.withdrawMatch(state, made.id, 'jihun');
  assert.equal(v1.openSeats(state.matches[0]), 1);
  state = d.cancelMatch(state, made.id, 'minseo');
  error(() => d.requestMatch(state, made.id, 'jihun'), '볼 수 없는 운동 자리입니다.');
  state = d.setDailyNote(state, 'minseo', day, '오늘은 두 종목!');
  assert.equal(state.dailyNotes.minseo[day], '오늘은 두 종목!');
  const notice = state.notifications.find((n) => n.userId === 'minseo');
  state = d.markNoticeRead(state, notice.id, 'minseo'); assert.equal(state.notifications.find((n) => n.id === notice.id).read, true);
  error(() => d.markNoticeRead(state, notice.id, 'sua'), '알림을 찾을 수 없습니다.');
  assert.equal(d.ranking(state, 'tennis', { period: 'month', month: '2026-08' }).length, 0);
  assert.equal(d.ranking(state, 'tennis', { period: 'month', month: '2026-09' }).length > 0, true);
  assert.equal(d.validateV2(state), true);
});

test('pending invitation reconciles with direct application and cancellation expires remaining invites', () => {
  let state = d.createExtendedSeed(day);
  const made = d.makeMatch(state, 'minseo', matchData, day); state = made.state;
  state = d.inviteToMatch(state, made.id, 'minseo', 'jihun');
  state = d.requestMatch(state, made.id, 'jihun');
  assert.equal(state.invitations.at(-1).status, 'accepted');
  assert.equal(state.matches[0].applications.find((a) => a.userId === 'jihun').status, 'accepted');
  const other = d.makeMatch(state, 'minseo', { ...matchData, title: '취소될 자리', capacity: 2 }, day); state = other.state;
  state = d.inviteToMatch(state, other.id, 'minseo', 'jihun');
  state = d.cancelMatch(state, other.id, 'minseo');
  assert.equal(state.invitations.at(-1).status, 'expired');
  assert.equal(d.activityFor(state, 'minseo', day).some((item) => item.match.id === other.id), false);
  assert.equal(state.notifications.some((notice) => notice.userId === 'jihun' && notice.text.includes('취소')), true);
  assert.equal(d.validateV2(state), true);
});


test('daily notes reject malformed containers and preserve JSON round trips', () => {
  const state = d.createExtendedSeed(day);
  for (const notes of [[], { minseo: 'broken' }, { ghost: {} }, { minseo: [] }, { minseo: { '2026-02-30': 'bad' } }, { minseo: { [day]: 7 } }, { minseo: { [day]: 'x'.repeat(141) } }]) {
    assert.equal(d.validateV2({ ...state, dailyNotes: notes }), false);
  }
  assert.throws(() => d.setDailyNote({ ...state, dailyNotes: [] }, 'minseo', day, 'lost'), { name: 'DomainError' });
  const saved = d.setDailyNote(state, 'minseo', day, '오늘도 & <함께>');
  const restored = JSON.parse(JSON.stringify(saved));
  assert.equal(d.validateV2(restored), true);
  assert.equal(restored.dailyNotes.minseo[day], '오늘도 & <함께>');
});

test('completed and cancelled matches close pending applications and invitations, including old v2', () => {
  let { state, id } = d.makeMatch(d.createExtendedSeed(day), 'minseo', matchData, day);
  state = d.requestMatch(state, id, 'jihun');
  state = d.requestMatch(state, id, 'sua');
  state = d.decideMatchRequest(state, id, 'minseo', 'jihun', 'accepted');
  const done = d.saveResult(state, id, 'minseo', { attendedIds: ['minseo','jihun'], teamAIds: ['minseo'], scoreA: 6, scoreB: 4 });
  assert.equal(done.matches.find(m => m.id === id).applications.find(a => a.userId === 'sua').closedReason, '운동 완료');
  assert.equal(done.notifications.some(n => n.userId === 'sua' && n.route === `#/activity?match=${id}` && n.text.includes('종료')), true);
  const legacy = structuredClone(done); legacy.matches.find(m => m.id === id).applications.find(a => a.userId === 'sua').status = 'pending';
  const repaired = d.reconcileRequests(legacy);
  assert.equal(repaired.matches.find(m => m.id === id).applications.find(a => a.userId === 'sua').closedReason, '운동 완료');
  assert.deepEqual(d.reconcileRequests(repaired), repaired);
  assert.equal(d.validateV2(repaired), true);
  let other = d.makeMatch(d.createExtendedSeed(day), 'minseo', matchData, day);
  other.state = d.inviteToMatch(other.state, other.id, 'minseo', 'jihun');
  other.state = d.requestMatch(other.state, other.id, 'sua');
  const cancelled = d.cancelMatch(other.state, other.id, 'minseo');
  assert.equal(cancelled.invitations.at(-1).status, 'expired');
  assert.equal(cancelled.matches[0].applications[0].closedReason, '자리 취소');
  assert.equal(d.validateV2(cancelled), true);
});

test('eligibility shares exact end-time boundary across listing, requests, accept and invitations', () => {
  const before = new Date('2026-09-30T20:59:00'), end = new Date('2026-09-30T21:00:00');
  const { state, id } = d.makeMatch(d.createExtendedSeed(day), 'minseo', matchData, day);
  const item = state.matches.find(m => m.id === id);
  assert.equal(d.canRequestMatch(state, item, 'jihun', before), true);
  assert.equal(d.canRequestMatch(state, item, 'minseo', before), false);
  assert.equal(d.filterMatches(state, 'jihun', {openOnly:true}, end).some(m => m.id === id), false);
  assert.throws(() => d.requestMatch(state, id, 'jihun', end), {name:'DomainError'});
  assert.throws(() => d.requestMatch(state, id, 'jihun', new Date('2026-10-01T00:00:00')), {name:'DomainError'});
  const pending = d.requestMatch(state, id, 'jihun', before);
  assert.equal(d.canRequestMatch(pending, pending.matches[0], 'jihun', before), false);
  assert.throws(() => d.decideMatchRequest(pending, id, 'minseo', 'jihun', 'accepted', end), {name:'DomainError'});
  const invited = d.inviteToMatch(state, id, 'minseo', 'jihun', before);
  assert.throws(() => d.decideInvitation(invited, invited.invitations.at(-1).id, 'jihun', 'accepted', end), {name:'DomainError'});
  assert.throws(() => d.inviteToMatch(state, id, 'minseo', 'jihun', end), {name:'DomainError'});
});

test('selected-sport edits retain deselected profile data and historic records', () => {
  const original = d.createExtendedSeed(day);
  const edited = d.editProfile(original, 'minseo', {chosenSports:['running'], sports:{running:{experience:'3년',level:'중급',preference:'10km'}}});
  assert.deepEqual(edited.users[0].sports.tennis, original.users[0].sports.tennis);
  assert.deepEqual(edited.results, original.results);
  assert.deepEqual(edited.users[0].chosenSports, ['running']);
  assert.equal(d.validateV2(edited), true);
});

test('multi-sport identity keeps per-sport metrics and combines only session counts', () => {
  const state = d.createExtendedSeed(day);
  const identity = d.sportIdentity(state, 'minseo', '2026-09');
  assert.deepEqual(identity.sports.map((item) => [item.sport, item.sessions]), [['tennis', 1], ['futsal', 1], ['running', 1]]);
  assert.equal(identity.total, 3);
  assert.equal(identity.activeSports, 3);
  assert.equal(identity.partners, 3);
  assert.equal(Math.round(identity.sports.reduce((sum, item) => sum + item.share, 0) * 1000), 1000);
  assert.equal(identity.stats.tennis.winRate, 100);
  assert.equal(d.sportIdentity(state, 'minseo', '2026-08').monthTotal, 0);
  const runnerOnly = d.editProfile(state, 'sua', { ...state.users.find((u) => u.id === 'sua'), chosenSports: ['running'], sports: { running: state.users.find((u) => u.id === 'sua').sports.running } });
  assert.deepEqual(d.sportIdentity(runnerOnly, 'sua').sports.map((item) => item.sport), ['running']);
  assert.equal(d.sportIdentity(state, 'nobody'), null);
});

test('match fit chips explain relationship, level and host manner without exposing more than three', () => {
  const state = d.createExtendedSeed(day);
  const open = state.matches.find((m) => m.id === 'today-open-tennis');
  const fit = d.matchFit(state, open, 'minseo');
  assert.deepEqual(fit.map((chip) => chip.kind), ['group', 'level', 'manner']);
  assert.equal(fit[0].text, '같은 그룹 · 함께 1회');
  assert.equal(fit[1].text, '누구나 환영');
  assert.equal(d.playedTogether(state, 'minseo', 'jihun'), 2);
  assert.deepEqual(d.matchFit(state, open, 'sua'), []);
  const futsal = state.matches.find((m) => m.id === 'weekend-futsal');
  assert.equal(d.matchFit(state, futsal, 'jihun')[0].text, '함께 운동 1회');
  const runner = d.editProfile(state, 'jihun', { ...state.users.find((u) => u.id === 'jihun'), chosenSports: ['running'], sports: { running: state.users.find((u) => u.id === 'jihun').sports.running } });
  assert.equal(d.matchFit(runner, open, 'jihun').some((chip) => chip.kind === 'new'), true);
  assert.equal(d.matchFit(state, open, 'jihun').every((chip) => chip.text.length <= 14), true);
});
