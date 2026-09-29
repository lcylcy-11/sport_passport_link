import test from 'node:test';
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
