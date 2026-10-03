import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtendedSeed, statsFor } from './extended-domain.js';
import { CONDS } from './kong.js';
import * as profile from './kong-profile.js';

const derive = (...args) => profile.deriveKongProfile(...args);
const conditionName = (derived) => CONDS[derived.conditionIndex]?.name;
const day = '2026-10-03';

function emptyState() {
  const state = createExtendedSeed(day);
  state.matches = []; state.results = [];
  return state;
}

function addExercise(state, { date = day, sport = 'tennis', format = sport === 'tennis' ? 'singles' : sport === 'futsal' ? 'team' : 'crew', hostId = 'minseo', applicationStatus = 'accepted', attendedIds = format === 'doubles' ? ['minseo', 'jihun', 'sua', 'hyunwoo'] : ['minseo', 'jihun'], noContest = false, status = 'open', startTime = '10:00' } = {}) {
  const matchId = `exercise-${state.nextId++}`;
  const capacity = format === 'doubles' ? 4 : sport === 'running' ? 6 : 2;
  const match = { id: matchId, hostId, sport, format, status, title: '허구 운동', region: '관악구', venue: '가상 코트', date, startTime, endTime: '23:00', capacity, level: '무관', description: '콩 집계 검증', visibility: 'public', groupId: null, applications: [...new Set([...attendedIds, 'jihun'])].filter((id) => id !== hostId).map((userId) => ({ userId, status: applicationStatus })) };
  const result = { matchId, sport, recordedBy: hostId, attendedIds: [...attendedIds] };
  if (sport === 'tennis') {
    if (noContest) result.noContest = true;
    else Object.assign(result, { teams: format === 'doubles' ? [['minseo', 'jihun'], ['sua', 'hyunwoo']] : [[attendedIds[0]], [attendedIds[1]]], winnerTeam: 0, scoreA: 6, scoreB: 4 });
  } else if (sport === 'futsal') Object.assign(result, { teamOutcome: 'win', scoreFor: 3, scoreAgainst: 1, mvpUserId: attendedIds[0], positions: Object.fromEntries(attendedIds.map((id) => [id, '윙'])) });
  else Object.assign(result, { entries: Object.fromEntries(attendedIds.map((id) => [id, { distanceKm: 5, paceSec: 330 }])), reviews: Object.fromEntries(attendedIds.map((id) => [id, '좋아요'])) });
  state.matches.push(match); state.results.push(result);
  return { match, result };
}

test('an account without attended saved results has null character states and zero item levels', () => {
  const actual = derive(emptyState(), 'minseo', day);
  assert.deepEqual(actual?.counts, { tennis: 0, futsal: 0, running: 0 });
  assert.deepEqual(actual?.itemLevels, { tennis: 0, futsal: 0, running: 0 });
  assert.equal(actual?.total, 0);
  assert.equal(actual?.stageIndex, null);
  assert.equal(actual?.conditionIndex, null);
  assert.equal(actual?.daysSinceLastExercise, null);
  assert.equal(actual?.recent7, 0); assert.equal(actual?.recent14, 0);
  assert.deepEqual(actual?.recentResults, []);
  assert.equal(actual?.dailyCounts14.length, 14);
  assert.ok(actual?.dailyCounts14.every(({ count }) => count === 0));
});

test('derived condition indices display the intended names in the preserved Kong renderer', () => {
  for (const [date, exercises, want] of [['2026-10-03', 1, '촉촉'], ['2026-10-03', 3, '쌩쌩'], ['2026-09-25', 1, '시들시들'], ['2026-09-18', 1, '쿨쿨']]) {
    const state = emptyState();
    for (let index = 0; index < exercises; index++) addExercise(state, { date });
    assert.equal(conditionName(derive(state, 'minseo', day)), want, `${date}, ${exercises} exercises`);
  }
});

test('singles, doubles, futsal and running each count one saved attended match', () => {
  const state = emptyState();
  addExercise(state); addExercise(state, { format: 'doubles' });
  addExercise(state, { sport: 'futsal' }); addExercise(state, { sport: 'running' });
  const actual = derive(state, 'minseo', day);
  assert.deepEqual(actual?.counts, { tennis: 2, futsal: 1, running: 1 });
  assert.equal(actual?.total, 4); assert.equal(conditionName(actual), '쌩쌩');
  assert.deepEqual(actual?.itemLevels, { tennis: 1, futsal: 1, running: 1 });
});

test('pending, cancelled, nonattended, unrelated, future and unsaved matches cannot grow Kong', () => {
  const state = emptyState();
  addExercise(state, { hostId: 'jihun', applicationStatus: 'pending' });
  addExercise(state, { status: 'cancelled' });
  addExercise(state, { attendedIds: ['jihun'], noContest: true });
  addExercise(state, { hostId: 'sua', attendedIds: ['sua', 'hyunwoo'] });
  addExercise(state, { date: '2026-10-04' });
  addExercise(state); state.results.pop();
  const actual = derive(state, 'minseo', day);
  assert.equal(actual?.total, 0); assert.equal(actual?.stageIndex, null);
});

test('a result does not bypass rejected attendance, missing matches or mismatched sports', () => {
  const state = emptyState();
  addExercise(state, { hostId: 'jihun', applicationStatus: 'rejected' });
  addExercise(state); state.matches.pop();
  const mismatch = addExercise(state); mismatch.result.sport = 'futsal';
  const noAttendance = addExercise(state); delete noAttendance.result.attendedIds;
  const invalidDate = addExercise(state, { date: '2026-02-30' });
  assert.equal(derive(state, 'minseo', day)?.total, 0);
  assert.equal(derive(state, 'unknown-user', day)?.total, 0);
  assert.equal(invalidDate.match.date, '2026-02-30');
});

test('duplicate results count each matchId once without changing the source state', () => {
  const state = emptyState(), first = addExercise(state);
  addExercise(state, { sport: 'running' });
  state.results.push(structuredClone(first.result));
  const before = structuredClone(state), actual = derive(state, 'minseo', day);
  assert.equal(actual?.total, 2); assert.equal(actual?.recent7, 2);
  assert.equal(actual?.recentResults.length, 2);
  assert.deepEqual(state, before);
});

test('attendance and totals remain isolated per user even when another participant records a result', () => {
  const state = createExtendedSeed(day);
  assert.deepEqual(derive(state, 'minseo', day)?.counts, { tennis: 1, futsal: 1, running: 1 });
  assert.deepEqual(derive(state, 'sua', day)?.counts, { tennis: 0, futsal: 0, running: 1 });
  assert.deepEqual(derive(state, 'hyunwoo', day)?.counts, { tennis: 0, futsal: 1, running: 0 });
});

test('growth stage advances only at the configured cumulative exercise boundaries', () => {
  for (const [total, want] of [[0, null], [1, 0], [4, 0], [5, 1], [14, 1], [15, 2], [29, 2], [30, 3], [49, 3], [50, 4], [99, 4], [100, 5], [101, 5]]) {
    const state = emptyState();
    for (let index = 0; index < total; index++) addExercise(state);
    assert.equal(derive(state, 'minseo', day)?.stageIndex, want, `total ${total}`);
  }
});

test('each sport item advances only at its own attended exercise boundaries', () => {
  for (const sport of ['tennis', 'futsal', 'running']) for (const [total, want] of [[0, 0], [1, 1], [9, 1], [10, 2], [24, 2], [25, 3], [49, 3], [50, 4], [51, 4]]) {
    const state = emptyState();
    for (let index = 0; index < total; index++) addExercise(state, { sport });
    assert.equal(derive(state, 'minseo', day)?.itemLevels[sport], want, `${sport} total ${total}`);
    for (const other of ['tennis', 'futsal', 'running'].filter((value) => value !== sport)) assert.equal(derive(state, 'minseo', day)?.itemLevels[other], 0);
  }
});

test('condition uses the 7, 8, 14 and 15 day rest boundaries without reducing earned growth', () => {
  const state = emptyState();
  for (let index = 0; index < 25; index++) addExercise(state, { date: '2026-09-18' });
  const baseline = derive(state, 'minseo', '2026-09-18');
  for (const [today, days, condition] of [['2026-09-24', 6, '쌩쌩'], ['2026-09-25', 7, '촉촉'], ['2026-09-26', 8, '시들시들'], ['2026-10-02', 14, '시들시들'], ['2026-10-03', 15, '쿨쿨']]) {
    const actual = derive(state, 'minseo', today);
    assert.equal(actual?.daysSinceLastExercise, days);
    assert.equal(conditionName(actual), condition, `rest ${days} days`);
    assert.deepEqual(actual?.counts, baseline?.counts);
    assert.equal(actual?.stageIndex, baseline?.stageIndex);
    assert.deepEqual(actual?.itemLevels, baseline?.itemLevels);
  }
  addExercise(state);
  assert.equal(conditionName(derive(state, 'minseo', day)), '촉촉');
  assert.equal(derive(state, 'minseo', day)?.daysSinceLastExercise, 0);
});

test('three exercises in today and the preceding six days earn the energetic condition', () => {
  const state = emptyState();
  addExercise(state, { date: '2026-09-27' }); addExercise(state, { date: '2026-09-30' });
  assert.equal(conditionName(derive(state, 'minseo', day)), '촉촉');
  addExercise(state);
  assert.equal(conditionName(derive(state, 'minseo', day)), '쌩쌩');
  assert.equal(derive(state, 'minseo', day)?.recent7, 3);
});

test('daily history includes empty days, excludes future days and uses inclusive Korean date windows', () => {
  const state = emptyState();
  for (const date of ['2026-09-19', '2026-09-20', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-03', '2026-10-04']) addExercise(state, { date });
  const actual = derive(state, 'minseo', day);
  assert.equal(actual?.total, 6); assert.equal(actual?.recent7, 3); assert.equal(actual?.recent14, 5);
  assert.deepEqual(actual?.dailyCounts14, [
    { date: '2026-09-20', count: 1 }, { date: '2026-09-21', count: 0 },
    { date: '2026-09-22', count: 0 }, { date: '2026-09-23', count: 0 },
    { date: '2026-09-24', count: 0 }, { date: '2026-09-25', count: 0 },
    { date: '2026-09-26', count: 1 }, { date: '2026-09-27', count: 1 },
    { date: '2026-09-28', count: 0 }, { date: '2026-09-29', count: 0 },
    { date: '2026-09-30', count: 0 }, { date: '2026-10-01', count: 0 },
    { date: '2026-10-02', count: 0 }, { date: '2026-10-03', count: 2 },
  ]);
  assert.deepEqual(actual?.recentResults.map(({ match }) => match.date), ['2026-10-03', '2026-10-03', '2026-09-27', '2026-09-26', '2026-09-20', '2026-09-19']);
});

test('same-day recent results use exercise start time while retaining full saved entries', () => {
  const state = emptyState();
  const morning = addExercise(state, { startTime: '09:00' });
  const evening = addExercise(state, { startTime: '19:00' });
  assert.deepEqual(derive(state, 'minseo', day)?.recentResults, [evening, morning]);
});

test('attended no-contest results follow a preview policy independently of competitive win rate', () => {
  const state = emptyState();
  addExercise(state, { attendedIds: ['minseo'], noContest: true });
  assert.equal(derive(state, 'minseo', day)?.total, 1);
  assert.equal(statsFor(state, 'minseo').tennis.games, 0);
  assert.equal(derive(state, 'minseo', day, { ...profile.KONG_PREVIEW_POLICY, includeNoContest: false })?.total, 0);
});

test('preview policy overrides growth, items and inactivity thresholds', () => {
  const state = emptyState();
  addExercise(state, { date: '2026-10-01' }); addExercise(state, { date: '2026-10-01' });
  const policy = { ...profile.KONG_PREVIEW_POLICY, stageThresholds: [1, 2], itemThresholds: [1, 2], energeticMinRecent7: 2, freshMaxDays: 1, wiltedMaxDays: 2 };
  assert.equal(derive(state, 'minseo', day, policy)?.stageIndex, 1);
  assert.equal(derive(state, 'minseo', day, policy)?.itemLevels.tennis, 2);
  assert.equal(conditionName(derive(state, 'minseo', day, policy)), '쌩쌩');
  policy.energeticMinRecent7 = 3;
  assert.equal(conditionName(derive(state, 'minseo', day, policy)), '시들시들');
  assert.equal(conditionName(derive(state, 'minseo', '2026-10-04', policy)), '쿨쿨');
});

test('Korean today changes at 15:00 UTC rather than the machine local midnight', () => {
  assert.equal(profile.koreaToday(new Date('2026-10-02T14:59:59.999Z')), '2026-10-02');
  assert.equal(profile.koreaToday(new Date('2026-10-02T15:00:00.000Z')), '2026-10-03');
  assert.equal(profile.koreaToday(new Date('2026-12-31T15:00:00.000Z')), '2027-01-01');
});

test('date arithmetic crosses leap-day and year boundaries without timezone offsets', () => {
  const state = emptyState(); addExercise(state, { date: '2024-02-28' });
  assert.equal(derive(state, 'minseo', '2024-03-01')?.daysSinceLastExercise, 2);
  const year = emptyState(); addExercise(year, { date: '2025-12-31' });
  const actual = derive(year, 'minseo', '2026-01-01');
  assert.equal(actual?.daysSinceLastExercise, 1);
  assert.deepEqual(actual?.dailyCounts14.slice(-2), [{ date: '2025-12-31', count: 1 }, { date: '2026-01-01', count: 0 }]);
});

test('malformed today is rejected instead of silently reporting an empty character', () => {
  assert.throws(() => derive(emptyState(), 'minseo', '2026-02-30'), RangeError);
  assert.throws(() => derive(emptyState(), 'minseo', '2026-10-03T00:00:00+09:00'), RangeError);
});
