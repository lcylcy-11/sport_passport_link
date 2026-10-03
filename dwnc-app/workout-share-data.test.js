import test from 'node:test';
import assert from 'node:assert/strict';

const share = await import('./workout-share-data.js').catch(() => ({}));
const confirmedAt = '2026-10-03T11:00:00.000Z';
const owner = { id: 'owner', name: '운동 친구', avatar: '✳', photo: 'data:image/png;base64,aGVsbG8=', friendCode: 'PRIVATE-CODE', bio: 'PRIVATE-BIO' };
const match = (id, sport, extras = {}) => ({ id, sport, title: `${sport} 운동`, date: '2026-10-03', startTime: '18:00', endTime: '19:00', venue: '운동장', region: '관악구', address: '서울 관악구 1', description: 'PRIVATE-DESCRIPTION', ...extras });
const stateFor = (matches, results, extras = {}) => ({ users: [owner, { id: 'peer', name: '다른 참가자', photo: 'PRIVATE-PEER-PHOTO' }], matches, results, ...extras });
const get = (state, ownerId, id) => {
  assert.equal(typeof share.getConfirmedWorkoutShareData, 'function', 'confirmed-record lookup must exist');
  return share.getConfirmedWorkoutShareData(state, ownerId, id);
};
const list = (state, ownerId, options) => {
  assert.equal(typeof share.listConfirmedWorkoutShareData, 'function', 'confirmed-record list must exist');
  return share.listConfirmedWorkoutShareData(state, ownerId, options);
};

test('running share uses the exact v1 contract and excludes all private peer and collaboration fields', () => {
  const state = stateFor([match('run', 'running', { location: { label: '합의한 공원', address: '서울 관악구 2', region: '관악구', privateNotes: 'PRIVATE-LOCATION' } })], [{
    matchId: 'run', sport: 'running', recordedBy: 'peer', attendedIds: ['owner', 'peer'],
    entries: { owner: { distanceKm: 7.2, paceSec: 315 }, peer: { distanceKm: 19.9, paceSec: 121 } },
    reviews: { owner: '상쾌했어요', peer: 'PRIVATE-PEER-REVIEW' },
    confirmation: { status: 'confirmed', confirmedAt, legacy: false, approvedIds: ['owner', 'peer'] },
  }], { resultProposals: [{ data: 'PRIVATE-PROPOSAL' }], messages: [{ text: 'PRIVATE-CHAT' }], ratings: [{ value: 1, fromId: 'peer', toId: 'owner' }] });
  const result = get(state, 'owner', 'run');
  assert.deepEqual(result, {
    schemaVersion: 1, recordId: 'run', ownerId: 'owner', confirmation: { status: 'confirmed', confirmedAt, legacy: false },
    sport: 'running', date: '2026-10-03', startTime: '18:00', endTime: '19:00', title: 'running 운동',
    location: { label: '합의한 공원', address: '서울 관악구 2', region: '관악구', latitude: null, longitude: null, placeId: null, provider: null },
    profile: { displayName: '운동 친구', avatar: '✳', photo: 'data:image/png;base64,aGVsbG8=' }, participantCount: 2,
    metrics: { kind: 'running', distanceKm: 7.2, paceSec: 315, review: '상쾌했어요' },
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|19\.9|121|approvedIds|recordedBy|attendedIds|ratings|entries|reviews/);
});

test('proposal, unrecorded schedule and absent participant never become share inputs', () => {
  const state = stateFor([match('pending', 'running'), match('future', 'running'), match('absent', 'running')], [{
    matchId: 'absent', sport: 'running', attendedIds: ['peer'], entries: { peer: { distanceKm: 5, paceSec: 300 } }, reviews: {},
  }], { resultProposals: [{ matchId: 'pending', status: 'pending', data: { attendedIds: ['owner'], entries: { owner: { distanceKm: 5, paceSec: 300 } } } }] });
  assert.deepEqual(list(state, 'owner'), []);
  assert.equal(get(state, 'owner', 'pending'), null);
  assert.equal(get(state, 'owner', 'future'), null);
  assert.equal(get(state, 'owner', 'absent'), null);
  assert.equal(get(state, 'unknown', 'absent'), null);
});

test('tennis retains raw A/B scores but derives each attendee outcome from their team', () => {
  const state = stateFor([match('tennis', 'tennis')], [{ matchId: 'tennis', sport: 'tennis', attendedIds: ['peer', 'owner'], teams: [['peer'], ['owner']], winnerTeam: 0, scoreA: 6, scoreB: 4 }]);
  assert.deepEqual(get(state, 'owner', 'tennis').metrics, { kind: 'tennis', noContest: false, scoreA: 6, scoreB: 4, outcome: 'loss' });
  assert.deepEqual(get(state, 'peer', 'tennis').metrics, { kind: 'tennis', noContest: false, scoreA: 6, scoreB: 4, outcome: 'win' });
});

test('legacy tennis keeps unknown scores and timestamps null while no-contest is explicit', () => {
  const state = stateFor([match('legacy', 'tennis'), match('nc', 'tennis')], [
    { matchId: 'legacy', sport: 'tennis', attendedIds: ['owner', 'peer'], teams: [['owner'], ['peer']], winnerTeam: 0, scoreA: null, scoreB: null },
    { matchId: 'nc', sport: 'tennis', attendedIds: ['owner'], noContest: true },
  ]);
  assert.deepEqual(get(state, 'owner', 'legacy').confirmation, { status: 'confirmed', confirmedAt: null, legacy: true });
  assert.deepEqual(get(state, 'owner', 'legacy').metrics, { kind: 'tennis', noContest: false, scoreA: null, scoreB: null, outcome: 'win' });
  assert.deepEqual(get(state, 'owner', 'nc').metrics, { kind: 'tennis', noContest: true, scoreA: null, scoreB: null, outcome: 'no-contest' });
  assert.equal(get(state, 'owner', 'nc').participantCount, 1);
});

test('futsal exposes only the owner MVP and position with the shared team score', () => {
  const state = stateFor([match('futsal', 'futsal')], [{ matchId: 'futsal', sport: 'futsal', attendedIds: ['owner', 'peer'], scoreFor: 3, scoreAgainst: 3, teamOutcome: 'draw', mvpUserId: 'peer', positions: { owner: '윙', peer: 'PRIVATE-PEER-POSITION' } }]);
  assert.deepEqual(get(state, 'owner', 'futsal').metrics, { kind: 'futsal', scoreFor: 3, scoreAgainst: 3, outcome: 'draw', isMvp: false, position: '윙' });
  assert.doesNotMatch(JSON.stringify(get(state, 'owner', 'futsal')), /PRIVATE-PEER-POSITION|mvpUserId|positions/);
  assert.equal(get(state, 'peer', 'futsal').metrics.isMvp, true);
});

test('list filters calendar date, orders newest first and returns detached share values', () => {
  const state = stateFor([match('old', 'running', { date: '2026-10-02' }), match('early', 'running', { startTime: '07:00', endTime: '08:00' }), match('late', 'running')], ['old', 'early', 'late'].map(id => ({ matchId: id, sport: 'running', attendedIds: ['owner'], entries: { owner: { distanceKm: 5, paceSec: 300 } }, reviews: {} })));
  const before = structuredClone(state);
  assert.deepEqual(list(state, 'owner').map(record => record.recordId), ['late', 'early', 'old']);
  assert.deepEqual(list(state, 'owner', { date: '2026-10-02' }).map(record => record.recordId), ['old']);
  const record = get(state, 'owner', 'late');
  assert.equal(record.metrics.review, null);
  record.profile.displayName = 'changed'; record.location.label = 'changed'; record.metrics.distanceKm = 50;
  assert.deepEqual(state, before);
});

test('invalid photos and missing optional fields become null without fabricated details', () => {
  const state = stateFor([match('futsal', 'futsal', { address: undefined })], [{ matchId: 'futsal', sport: 'futsal', attendedIds: ['owner', 'peer'], scoreFor: 2, scoreAgainst: 1, teamOutcome: 'win', mvpUserId: 'owner', positions: {} }]);
  state.users[0] = { ...owner, photo: 'javascript:alert(1)' };
  const record = get(state, 'owner', 'futsal');
  assert.equal(record.profile.photo, null);
  assert.equal(record.metrics.position, null);
  assert.deepEqual(record.location, { label: '운동장', address: '', region: '관악구', latitude: null, longitude: null, placeId: null, provider: null });
});
