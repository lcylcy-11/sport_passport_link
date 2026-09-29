import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, createMatch, applyToMatch, decideApplication, recordResult, statsFor, ranking, activityFor, filterMatches, openSeats, switchUser, updateProfile, validateState } from './domain.js';

const base = '2026-09-30';
const newTennis = { sport: 'tennis', title: '테스트 랠리', region: '관악구', venue: '관악구민운동장', date: base, startTime: '20:00', endTime: '21:00', capacity: 2, level: '중급', description: '즐거운 단식' };
const rejects = (fn, message) => assert.throws(fn, { name: 'DomainError', message });

test('create → apply → host accept → result changes schedule, profile, today, ranking exactly once', () => {
  let state = createSeed(base);
  const before = statsFor(state, 'minseo').tennis;
  const created = createMatch(state, 'minseo', newTennis, base); state = created.state;
  assert.equal(openSeats(state.matches[0]), 1);
  state = switchUser(state, 'sua');
  state = applyToMatch(state, created.id, 'sua');
  rejects(() => applyToMatch(state, created.id, 'sua'), '이미 신청한 운동 자리입니다.');
  rejects(() => decideApplication(state, created.id, 'sua', 'sua', 'accepted'), '모집자만 신청을 결정할 수 있습니다.');
  state = switchUser(state, 'minseo');
  state = decideApplication(state, created.id, 'minseo', 'sua', 'accepted');
  assert.equal(openSeats(state.matches[0]), 0);
  assert.equal(activityFor(state, 'sua', base).some((item) => item.match.id === created.id), true);
  state = recordResult(state, created.id, 'sua', { winnerId: 'sua' });
  assert.equal(statsFor(state, 'minseo').tennis.losses, before.losses + 1);
  assert.equal(statsFor(state, 'sua').tennis.wins, 1);
  assert.equal(activityFor(state, 'sua', base).find((item) => item.match.id === created.id).result.winnerId, 'sua');
  assert.equal(ranking(state, 'tennis', { region: '관악구' }).some((row) => row.user.id === 'sua'), true);
  rejects(() => recordResult(state, created.id, 'minseo', { winnerId: 'minseo' }), '이 운동의 결과는 이미 기록되었습니다.');
});

test('invalid dates, time order, capacity and required fields are rejected', () => {
  const state = createSeed(base);
  rejects(() => createMatch(state, 'minseo', { ...newTennis, date: '2026-02-30' }, base), '오늘 또는 이후의 날짜를 선택해 주세요.');
  rejects(() => createMatch(state, 'minseo', { ...newTennis, endTime: '19:00' }, base), '종료 시간을 시작 시간보다 늦게 설정해 주세요.');
  rejects(() => createMatch(state, 'minseo', { ...newTennis, capacity: 3 }, base), '테니스 단식 정원은 2명입니다.');
  rejects(() => createMatch(state, 'minseo', { ...newTennis, venue: '' }, base), '제목, 지역, 장소, 설명을 모두 입력해 주세요.');
});

test('application guards: self, full, completed, and rejection', () => {
  let state = createSeed(base);
  rejects(() => applyToMatch(state, 'today-tennis', 'jihun'), '내가 만든 자리에는 신청할 수 없습니다.');
  rejects(() => applyToMatch(state, 'today-tennis', 'sua'), '정원이 마감되었습니다.');
  rejects(() => applyToMatch(state, 'past-tennis', 'sua'), '이미 완료된 운동에는 신청할 수 없습니다.');
  state = applyToMatch(state, 'weekend-run', 'minseo');
  state = decideApplication(state, 'weekend-run', 'sua', 'minseo', 'rejected');
  assert.equal(state.matches.find((m) => m.id === 'weekend-run').applications[0].status, 'rejected');
  rejects(() => decideApplication(state, 'weekend-run', 'sua', 'minseo', 'accepted'), '대기 중인 신청이 없습니다.');
});

test('running uses distance-weighted pace; ranking scope excludes inactive users', () => {
  let state = createSeed(base);
  const created = createMatch(state, 'minseo', { ...newTennis, sport: 'running', capacity: 3, title: '저녁 러닝' }, base); state = created.state;
  state = applyToMatch(state, created.id, 'sua');
  state = decideApplication(state, created.id, 'minseo', 'sua', 'accepted');
  state = recordResult(state, created.id, 'minseo', { entries: { minseo: { distanceKm: 10, paceSec: 300 }, sua: { distanceKm: 5, paceSec: 360 } } });
  const running = statsFor(state, 'minseo').running;
  assert.equal(running.runs, 2);
  assert.equal(running.distanceKm, 15.2);
  assert.equal(running.paceSec, Math.round((5.2 * 342 + 10 * 300) / 15.2));
  assert.deepEqual(ranking(state, 'running', { venue: '존재하지 않는 구장' }), []);
  assert.equal(ranking(state, 'running', { venue: '보라매공원' }).length, 2);
});

test('futsal team result and MVP apply consistently to accepted teammates', () => {
  const state = createSeed(base);
  const stats = statsFor(state, 'hyunwoo').futsal;
  assert.equal(stats.games, 1); assert.equal(stats.mvp, 1);
  assert.equal(statsFor(state, 'jihun').futsal.wins, 1);
  assert.equal(ranking(state, 'futsal', { region: '동작구' })[0].user.id, 'hyunwoo');
  const created = createMatch(state, 'minseo', { ...newTennis, sport: 'futsal', capacity: 3 }, base);
  let next = applyToMatch(created.state, created.id, 'jihun');
  next = decideApplication(next, created.id, 'minseo', 'jihun', 'accepted');
  next = recordResult(next, created.id, 'minseo', { scoreFor: 4, scoreAgainst: 2, mvpUserId: 'jihun' });
  assert.equal(statsFor(next, 'jihun').futsal.wins, 2);
  assert.equal(statsFor(next, 'minseo').futsal.wins, 2);
  assert.equal(statsFor(next, 'jihun').futsal.mvp, 1);
});

test('filtering and profile edits are deterministic and state remains immutable', () => {
  const state = createSeed(base);
  const filtered = filterMatches(state, { sport: 'running', region: '관악구', time: 'morning', openOnly: true });
  assert.deepEqual(filtered.map((m) => m.id), ['weekend-run']);
  const next = updateProfile(state, 'minseo', { name: '민서', sports: { tennis: { experience: '3년', level: '상급', preference: '단식', ntrp: '4.0' } } });
  assert.equal(state.users[0].name, '김민서');
  assert.equal(next.users[0].sports.tennis.level, '상급');
  assert.deepEqual(statsFor(next, 'minseo'), statsFor(state, 'minseo'));
});

test('seed offers an open tennis match this evening and malformed stored structures are rejected', () => {
  const state = createSeed(base);
  assert.equal(filterMatches(state, { sport: 'tennis', region: '관악구', date: base, time: 'evening', openOnly: true }).some((m) => m.id === 'today-open-tennis'), true);
  assert.equal(validateState(state), true);
  const badMatch = structuredClone(state); badMatch.matches = [null];
  assert.equal(validateState(badMatch), false);
  const badSport = structuredClone(state); delete badSport.users[0].sports.tennis;
  assert.equal(validateState(badSport), false);
  const badResult = structuredClone(state); delete badResult.results[0].entries;
  assert.equal(validateState(badResult), false);
  assert.equal(updateProfile(state, 'minseo', { sports: { tennis: { experience: '3년', level: '상급', preference: '단식', ntrp: '6.5' } } }).users[0].sports.tennis.ntrp, '6.5');
  rejects(() => updateProfile(state, 'minseo', { sports: { tennis: { experience: '3년', level: '상급', preference: '단식', ntrp: '7.5' } } }), '테니스 NTRP는 1.0~7.0 사이에서 0.5 단위로 입력해 주세요.');
  rejects(() => updateProfile(state, 'minseo', { sports: { tennis: { experience: '3년', level: '상급', preference: '단식', ntrp: '8.0' } } }), '테니스 NTRP는 1.0~7.0 사이에서 0.5 단위로 입력해 주세요.');
});
