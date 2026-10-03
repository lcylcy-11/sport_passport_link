import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtendedSeed } from './extended-domain.js';
import { deriveKongProfile } from './kong-profile.js';
import * as model from './service-model.js';

const call = (name, ...args) => { assert.equal(typeof model[name], 'function', `${name} must exist`); return model[name](...args); };
const day = '2026-10-03';
const now = new Date('2026-10-03T09:00:00+09:00');

function fixture() {
  const state = createExtendedSeed(day);
  state.matches = []; state.results = [];
  state.users.forEach((user) => { user.region = '관악구'; user.chosenSports = ['tennis', 'running', 'futsal']; Object.values(user.sports).forEach((sport) => { sport.experience = '입문'; }); });
  return state;
}

function match(state, { id = `fixture-${state.nextId++}`, hostId = 'jihun', sport = 'tennis', date = '2026-10-04', startTime = '10:00', endTime = '11:00', region = '관악구', applications = [], ...rest } = {}) {
  const value = { id, hostId, sport, date, startTime, endTime, region, applications, title: '허구 운동', venue: '가상 운동장', format: sport === 'tennis' ? 'singles' : sport === 'futsal' ? 'team' : 'crew', capacity: sport === 'tennis' ? 2 : 6, status: 'open', visibility: 'public', groupId: null, level: '무관', description: '검증용 운동', ...rest };
  state.matches.push(value); return value;
}

function record(state, { date = day, sport = 'tennis', hostId = 'minseo', attendedIds = ['minseo', 'jihun'], noContest = false, winnerTeam = 0, ...rest } = {}) {
  const value = match(state, { date, sport, hostId, applications: attendedIds.filter((userId) => userId !== hostId).map((userId) => ({ userId, status: 'accepted' })), ...rest });
  const result = { matchId: value.id, sport, recordedBy: hostId, attendedIds };
  if (sport === 'tennis') Object.assign(result, noContest ? { noContest: true } : { teams: [[attendedIds[0]], [attendedIds[1]]], winnerTeam, scoreA: 6, scoreB: 4 });
  if (sport === 'futsal') Object.assign(result, { teamOutcome: 'win', scoreFor: 3, scoreAgainst: 1, mvpUserId: attendedIds[0], positions: {} });
  if (sport === 'running') Object.assign(result, { entries: Object.fromEntries(attendedIds.map((id) => [id, { distanceKm: 5, paceSec: 330 }])), reviews: {} });
  state.results.push(result); return { match: value, result };
}

test('experience uses only unambiguous Korean years/months and preserves unknown as zero', () => {
  for (const [value, expected] of [['2년', 24], ['6개월', 6], ['1년 6개월', 18], ['1.5년', 18], ['3달', 3], ['0년', 0], ['입문', 0], ['약 2년', 0], ['1년 미만', 0], ['2년 이상', 0], ['-1년', 0], ['2020년부터', 0], ['', 0], [null, 0], ['0.1년', 0]]) assert.equal(call('parseExperienceMonths', value), expected, String(value));
});

test('region ranking combines win rate, capped declared career and real sport attendance without mutating state', () => {
  const state = fixture();
  state.users[0].sports.tennis.experience = '2년';
  state.users[1].sports.tennis.experience = '30년';
  state.users[2].region = '동작구'; state.users[2].sports.tennis.experience = '10년';
  record(state, { region: '동작구' });
  record(state, { date: '2026-09-25', winnerTeam: 1 });
  record(state, { date: '2026-09-19' });
  const before = structuredClone(state), rows = call('regionalRanking', state, 'tennis', { region: '관악구', today: day });
  assert.deepEqual(rows.map((row) => row.user.id), ['minseo', 'jihun']);
  assert.deepEqual([rows[0].winPoints, rows[0].careerPoints, rows[0].recentPoints, rows[0].score], [33.5, 4, 10, 47.5]);
  assert.deepEqual([rows[1].winPoints, rows[1].careerPoints, rows[1].recentPoints, rows[1].score], [16.5, 20, 10, 46.5]);
  assert.equal(rows[1].careerMonths, 360); assert.equal(rows[0].recent14, 2);
  assert.equal(rows.some((row) => row.user.region !== '관악구'), false); assert.deepEqual(state, before);
});

test('zero activity and unknown career do not invent ranked history, chosen sport is required', () => {
  const state = fixture();
  state.users[0].sports.tennis.experience = '알 수 없음';
  state.users[1].sports.tennis.experience = '3년'; state.users[1].chosenSports = ['running'];
  assert.deepEqual(call('regionalRanking', state, 'tennis', { region: '관악구', today: day }), []);
  assert.deepEqual(call('regionalRanking', state, 'invalid', { today: day }), []);
});

test('pending, future, cancelled, wrong-sport and duplicate results cannot increase ranking', () => {
  const state = fixture();
  record(state, { hostId: 'jihun', applications: [{ userId: 'minseo', status: 'pending' }] });
  record(state, { date: '2026-10-04' }); record(state, { status: 'cancelled' });
  const wrong = record(state); wrong.result.sport = 'running';
  const actual = record(state); state.results.push(structuredClone(actual.result));
  const mine = call('regionalRanking', state, 'tennis', { today: day }).find((row) => row.user.id === 'minseo');
  assert.equal(mine.stats.tennis.games, 1); assert.equal(mine.recent14, 1); assert.equal(mine.score, 55);
});

test('noContest is attended activity but never a competitive win; running remains competitive-neutral', () => {
  const state = fixture();
  record(state, { attendedIds: ['minseo'], noContest: true });
  const tennis = call('regionalRanking', state, 'tennis', { today: day }).find((row) => row.user.id === 'minseo');
  assert.deepEqual([tennis.games, tennis.winRate, tennis.winPoints, tennis.recent14, tennis.score], [0, 0, 0, 1, 5]);
  state.users[0].sports.running.experience = '1년';
  for (let index = 0; index < 8; index++) record(state, { sport: 'running', attendedIds: ['minseo'] });
  const running = call('regionalRanking', state, 'running', { today: day }).find((row) => row.user.id === 'minseo');
  assert.deepEqual([running.games, running.winRate, running.winPoints, running.careerPoints, running.recentPoints, running.score], [0, 0, 0, 2, 30, 32]);
  assert.equal(running.stats.running.runs, 8);
});

test('futsal uses actual win proportion including draws and deterministic name/id tie ordering', () => {
  const state = fixture();
  const first = record(state, { sport: 'futsal' });
  const second = record(state, { sport: 'futsal' }); second.result.teamOutcome = 'draw'; second.result.scoreFor = second.result.scoreAgainst = 0;
  state.users[0].name = state.users[1].name = '동일 닉네임';
  const rows = call('regionalRanking', state, 'futsal', { today: day });
  assert.deepEqual(rows.map((row) => row.user.id), ['jihun', 'minseo']);
  assert.equal(rows[0].winRate, 50); assert.equal(rows[0].score, 35); assert.equal(first.result.teamOutcome, 'win');
});

test('regional score uses public workouts consistently across viewers while private workouts still grow the owner Kong', () => {
  const ownerState = fixture();
  record(ownerState);
  record(ownerState, { visibility: 'group', groupId: 'group-motion', winnerTeam: 1 });
  record(ownerState, { visibility: 'friends', winnerTeam: 1 });
  const outsiderState = structuredClone(ownerState);
  outsiderState.matches = outsiderState.matches.filter((item) => item.visibility === 'public');
  const publicIds = new Set(outsiderState.matches.map((item) => item.id));
  outsiderState.results = outsiderState.results.filter((result) => publicIds.has(result.matchId));
  const ownerRows = call('regionalRanking', ownerState, 'tennis', { region: '관악구', today: day });
  const outsiderRows = call('regionalRanking', outsiderState, 'tennis', { region: '관악구', today: day });
  assert.deepEqual(ownerRows, outsiderRows);
  const mine = ownerRows.find((row) => row.user.id === 'minseo');
  assert.deepEqual([mine.games, mine.winRate, mine.recent14, mine.score], [1, 100, 1, 55]);
  assert.equal(deriveKongProfile(ownerState, 'minseo', day).total, 3);
});

test('matching suggestions include visible eligible same-region chosen sports with actionable reasons', () => {
  const state = fixture(); state.users[0].chosenSports = ['tennis'];
  const schedule = match(state, { id: 'mine', hostId: 'minseo', startTime: '10:00', endTime: '11:00' });
  const nearby = match(state, { id: 'nearby', startTime: '11:00', endTime: '12:00' });
  match(state, { id: 'far-day', date: '2026-10-06' }); match(state, { id: 'wrong-region', region: '동작구' }); match(state, { id: 'wrong-sport', sport: 'running' });
  const before = structuredClone(state), rows = call('matchingSuggestions', state, 'minseo', { today: day, now, limit: 5 });
  assert.deepEqual(rows.map((row) => row.match.id), ['nearby', 'far-day']);
  assert.equal(rows[0].match, nearby); assert.equal(rows[0].schedule, schedule);
  assert.ok(rows[0].reasons.includes('내 활동 지역')); assert.ok(rows[0].reasons.includes('내 일정과 같은 날')); assert.ok(rows[0].reasons.includes('확정 일정과 시간 겹침 없음'));
  assert.deepEqual(state, before);
});

test('confirmed schedules block overlaps across sports, touching boundaries and pending schedules stay available', () => {
  const state = fixture();
  match(state, { id: 'confirmed-run', sport: 'running', hostId: 'sua', startTime: '10:00', endTime: '11:00', applications: [{ userId: 'minseo', status: 'accepted' }] });
  match(state, { id: 'pending-mine', startTime: '13:00', endTime: '14:00', applications: [{ userId: 'minseo', status: 'pending' }] });
  match(state, { id: 'overlap', startTime: '10:30', endTime: '11:30' });
  match(state, { id: 'touch', startTime: '11:00', endTime: '12:00' });
  match(state, { id: 'pending-okay', startTime: '13:00', endTime: '14:00' });
  assert.deepEqual(call('matchingSuggestions', state, 'minseo', { today: day, now, limit: 5 }).map((row) => row.match.id), ['touch', 'pending-okay']);
});

test('matching reuses access and request eligibility, excluding completed, full, cancelled, own, applied and past', () => {
  const state = fixture();
  match(state, { id: 'own', hostId: 'minseo', startTime: '12:00', endTime: '13:00' });
  match(state, { id: 'applied', applications: [{ userId: 'minseo', status: 'rejected' }] });
  match(state, { id: 'private', visibility: 'group', groupId: 'missing' });
  match(state, { id: 'full', applications: [{ userId: 'sua', status: 'accepted' }] });
  match(state, { id: 'cancelled', status: 'cancelled' }); match(state, { id: 'past', date: '2026-10-02' });
  match(state, { id: 'today-ended', date: day, startTime: '07:00', endTime: '08:00' });
  const done = record(state, { date: '2026-10-04', hostId: 'jihun', attendedIds: ['jihun', 'sua'] }); done.match.id = 'done'; done.result.matchId = 'done';
  match(state, { id: 'okay' });
  assert.deepEqual(call('matchingSuggestions', state, 'minseo', { today: day, now, limit: 10 }).map((row) => row.match.id), ['okay']);
  assert.deepEqual(call('matchingSuggestions', state, 'unknown', { today: day, now }), []);
  assert.deepEqual(call('matchingSuggestions', state, 'minseo', { today: day, now, limit: 0 }), []);
});

test('Korean recruitment cutoff remains on the Korean day near the UTC date boundary', () => {
  const state = fixture();
  match(state, { id: 'ended', date: day, startTime: '00:00', endTime: '00:30' });
  match(state, { id: 'later', date: day, startTime: '02:00', endTime: '03:00' });
  assert.deepEqual(call('matchingSuggestions', state, 'minseo', { today: day, now: new Date('2026-10-02T16:00:00Z') }).map((row) => row.match.id), ['later']);
});

test('schedule past cutoff uses Korean end time including the exact boundary without changing match status', () => {
  const state = fixture();
  const ended = match(state, { date: day, startTime: '00:00', endTime: '00:30' });
  const boundary = match(state, { date: day, startTime: '00:00', endTime: '01:00' });
  const later = match(state, { date: day, startTime: '02:00', endTime: '03:00' });
  const previous = match(state, { date: '2026-10-02' });
  const tomorrow = match(state, { date: '2026-10-04', startTime: '00:00', endTime: '00:30' });
  const clock = { today: day, now: new Date('2026-10-02T16:00:00Z') };
  assert.deepEqual([ended, boundary, later, previous, tomorrow].map((item) => call('isPastSchedule', item, clock)), [true, true, false, true, false]);
  assert.equal(ended.status, 'open');
});

test('closed recruitment on agreed future appointments preserves upcoming schedules and blocks double booking', () => {
  const state = fixture();
  const agreed = match(state, { id: 'agreed', sport: 'running', hostId: 'sua', recruitmentClosed: true, applications: [{ userId: 'minseo', status: 'accepted' }] });
  match(state, { id: 'overlapping', startTime: '10:30', endTime: '11:30' });
  match(state, { id: 'touching', startTime: '11:00', endTime: '12:00' });
  assert.equal(call('isPastSchedule', agreed, { today: day, now }), false);
  assert.deepEqual(call('matchingSuggestions', state, 'minseo', { today: day, now }).map((row) => row.match.id), ['touching']);
  assert.equal(call('isPastSchedule', agreed, { today: agreed.date, now: new Date('2026-10-04T11:00:00+09:00') }), true);
});

test('injected today selects the Korean calendar day while now supplies only Korean wall time', () => {
  const state = fixture();
  const ended = match(state, { id: 'ended', date: day, startTime: '07:00', endTime: '08:00' });
  const later = match(state, { id: 'later', date: day, startTime: '10:00', endTime: '11:00' });
  const options = { today: day, now: new Date('2000-01-01T00:00:00Z') };
  assert.deepEqual(call('matchingSuggestions', state, 'minseo', options).map((row) => row.match.id), ['later']);
  assert.equal(call('isPastSchedule', ended, options), true);
  assert.equal(call('isPastSchedule', later, options), false);
  for (const today of ['2026-02-30', '2026-13-01', '2026-1-03']) {
    assert.throws(() => call('matchingSuggestions', state, 'minseo', { ...options, today }), RangeError);
    assert.throws(() => call('isPastSchedule', later, { ...options, today }), RangeError);
  }
});
