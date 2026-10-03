import test from 'node:test';
import assert from 'node:assert/strict';

test('recent sport activity covers exactly 30 calendar days, actual attendance and unique completed sessions', async () => {
  const { recentSportActivity } = await import('./home-character.js');
  const matches = [
    ['today', 'tennis', '2026-10-03'], ['boundary', 'futsal', '2026-09-04'],
    ['old', 'tennis', '2026-09-03'], ['future', 'running', '2026-10-04'],
    ['absent', 'running', '2026-10-01'], ['run', 'running', '2026-09-30'],
    ['pending', 'tennis', '2026-10-02'], ['cancelled', 'tennis', '2026-10-01'],
  ].map(([id, sport, date]) => ({ id, sport, date, status: id === 'cancelled' ? 'cancelled' : 'open' }));
  const results = ['today', 'today', 'boundary', 'old', 'future', 'absent', 'run', 'cancelled', 'missing'].map(matchId => ({ matchId, attendedIds: matchId === 'absent' ? ['other'] : ['me'] }));
  assert.deepEqual(recentSportActivity({ matches, results }, 'me', '2026-10-03'), { tennis: 1, futsal: 1, running: 1 });
  assert.deepEqual(recentSportActivity({ matches, results }, 'nobody', '2026-10-03'), { tennis: 0, futsal: 0, running: 0 });
  assert.deepEqual(recentSportActivity({ matches: [], results: [] }, 'me', '2026-03-01'), { tennis: 0, futsal: 0, running: 0 });
});

test('character provider replaces preview art and levels without inventing a growth formula', async () => {
  const { homeCharacterFor, registerHomeCharacterProvider } = await import('./home-character.js');
  const state = { matches: [], results: [] };
  const preview = homeCharacterFor(state, 'me', '2026-10-03');
  assert.equal(preview.preview, true);
  assert.equal(preview.imageUrl, './assets/kong-preview-v1.png');
  assert.equal(preview.nickname, '콩식이');
  assert.deepEqual(preview.levels, { tennis: null, futsal: null, running: null });
  registerHomeCharacterProvider((input, id) => {
    assert.equal(input, state); assert.equal(id, 'me');
    return { nickname: '  콩대장  ', imageUrl: './assets/kong-final.png', levels: { tennis: 4, futsal: 2, running: 3 } };
  });
  try {
    const character = homeCharacterFor(state, 'me', '2026-10-03');
    assert.equal(character.preview, false);
    assert.equal(character.imageUrl, './assets/kong-final.png');
    assert.equal(character.nickname, '콩대장');
    assert.deepEqual(character.levels, { tennis: 4, futsal: 2, running: 3 });
  } finally { registerHomeCharacterProvider(null); }
  registerHomeCharacterProvider(() => ({ imageUrl: 'javascript:alert(1)', levels: { tennis: -1, futsal: '9', running: Infinity } }));
  try {
    const character = homeCharacterFor(state, 'me', '2026-10-03');
    assert.equal(character.imageUrl, preview.imageUrl);
    assert.deepEqual(character.levels, preview.levels);
  } finally { registerHomeCharacterProvider(null); }
});

test('Kong nickname validation trims names and rejects empty or oversized values', async () => {
  const { normalizeKongNickname } = await import('./home-character.js');
  assert.equal(normalizeKongNickname('  콩식이  '), '콩식이');
  assert.equal(normalizeKongNickname('콩 <친구>'), '콩 <친구>');
  assert.equal(normalizeKongNickname('가'.repeat(16)), '가'.repeat(16));
  for (const input of ['', '   ', '가'.repeat(17), null, undefined, 123]) assert.equal(normalizeKongNickname(input), null);
});
