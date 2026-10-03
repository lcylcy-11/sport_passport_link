import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const fixture = String.raw`
  import { mock } from 'node:test';
  import * as domain from './domain.js';
  import * as extended from './extended-domain.js';
  import { koreaToday } from './kong-profile.js';
  import { matchingSuggestions, isPastSchedule } from './service-model.js';
  const instant = new Date(process.env.FIXTURE_NOW);
  mock.timers.enable({ apis: ['Date'], now: instant });
  const state = extended.createExtendedSeed('2026-10-03');
  const match = { ...state.matches.find(item => item.id === 'today-open-tennis'),
    id: 'midnight', date: '2026-10-03', startTime: '00:00', endTime: '00:30',
    hostId: 'jihun', applications: [] };
  state.matches = [match]; state.results = [];
  const created = domain.createSeed();
  let previousDayAllowed = true;
  try { extended.makeMatch(state, 'minseo', { ...match, date: '2026-10-02' }); }
  catch (error) { if (error.name !== 'DomainError') throw error; previousDayAllowed = false; }
  console.log(JSON.stringify({
    today: domain.today(), kongToday: koreaToday(),
    seedDay: created.matches.find(item => item.id === 'today-tennis').date,
    seedPastDay: created.matches.find(item => item.id === 'past-tennis').date,
    activity: extended.activityFor(state, 'jihun').map(item => item.match.id),
    request: extended.canRequestMatch(state, match, 'minseo', instant),
    search: extended.filterMatches(state, 'minseo', { openOnly: true }, instant).length,
    suggestions: matchingSuggestions(state, 'minseo', { now: instant }).length,
    past: isPastSchedule(match, { now: instant }), previousDayAllowed,
    validState: extended.validateV2(state)
  }));
`;

function at(timeZone, instant) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', fixture], {
    cwd: new URL('.', import.meta.url), encoding: 'utf8',
    env: { ...process.env, TZ: timeZone, FIXTURE_NOW: instant },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const timeZone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Auckland']) {
  test(`${timeZone}: native date defaults and recruitment agree after Korean midnight`, () => {
    assert.deepEqual(at(timeZone, '2026-10-02T16:00:00Z'), {
      today: '2026-10-03', kongToday: '2026-10-03', seedDay: '2026-10-03',
      seedPastDay: '2026-09-28', activity: ['midnight'],
      request: false, search: 0, suggestions: 0, past: true,
      previousDayAllowed: false, validState: true,
    });
  });

  test(`${timeZone}: recruitment and schedules share the exact Korean end boundary`, () => {
    const before = at(timeZone, '2026-10-02T15:29:59.999Z');
    const boundary = at(timeZone, '2026-10-02T15:30:00Z');
    assert.deepEqual([before.request, before.search, before.suggestions, before.past], [true, 1, 1, false]);
    assert.deepEqual([boundary.request, boundary.search, boundary.suggestions, boundary.past], [false, 0, 0, true]);
  });

  test(`${timeZone}: today changes at Korean midnight`, () => {
    const before = at(timeZone, '2026-10-02T14:59:59.999Z');
    const boundary = at(timeZone, '2026-10-02T15:00:00Z');
    assert.equal(before.today, '2026-10-02');
    assert.equal(boundary.today, '2026-10-03');
  });
}
