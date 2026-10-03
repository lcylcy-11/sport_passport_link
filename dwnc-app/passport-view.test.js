import test from 'node:test';
import assert from 'node:assert/strict';

const passport = await import('./passport-view.js').catch(() => ({}));
const kong = await import('./kong-profile-view.js');
const person = {
  id: 'u1', name: '<민서 & 친구>', gender: '여성', ageRange: '20대', region: '관악구',
  friendCode: 'DWNC-0001', avatar: '✳', bio: '운동 <친구>를 찾아요.',
  chosenSports: ['tennis', 'running'],
  sports: { tennis: { experience: '3년', level: '중급', ntrp: 3.5 }, running: { experience: '1년', level: '초급' } },
};
const derived = {
  counts: { tennis: 1, running: 0, futsal: 0 }, itemLevels: { tennis: 1, running: 0, futsal: 0 },
  total: 1, stageIndex: 0, conditionIndex: 2, daysSinceLastExercise: 0,
  recent7: 1, recent14: 1, dailyCounts14: [{ date: '2026-10-03', count: 1 }],
  recentResults: [{ match: { id: 'm1', sport: 'tennis', date: '2026-10-03', venue: '센터' }, result: { noContest: true } }],
};

test('public identity is the default face and exposes actual age, gender and sport experience', () => {
  assert.equal(typeof passport.renderPassportCard, 'function');
  const html = passport.renderPassportCard({}, person, derived);
  assert.match(html, /data-flipped="false"/);
  assert.match(html, /passport-front[^>]*aria-hidden="false"/);
  assert.match(html, /passport-back[^>]*aria-hidden="true"[^>]*\binert\b/);
  assert.match(html, /20대/);
  assert.match(html, /여성/);
  assert.match(html, /구력/);
  assert.match(html, /3년/);
  assert.match(html, /중급/);
  assert.match(html, /data-action="flip-passport" data-user="u1"/);
  assert.match(html, /aria-pressed="false"[^>]*>[^<]*콩 키우기 보기/);
  assert.doesNotMatch(html, /스탬프|STAMPS|stamp-grid|data-action="stamp"/);
});

test('flipped card hides and disables public face while enabling the Kong face', () => {
  assert.equal(typeof passport.renderPassportCard, 'function');
  const html = passport.renderPassportCard({}, person, derived, { flipped: true, own: true });
  assert.match(html, /data-flipped="true"/);
  assert.match(html, /passport-front[^>]*aria-hidden="true"[^>]*\binert\b/);
  assert.match(html, /passport-back[^>]*aria-hidden="false"/);
  assert.match(html, /aria-pressed="true"[^>]*>[^<]*신분증 보기/);
  assert.match(html, /href="#\/matches"[^>]*>.*운동 기록하기/s);
});

test('public strings are escaped, invalid photos are excluded and biography appears once', () => {
  assert.equal(typeof passport.renderPassportCard, 'function');
  const html = passport.renderPassportCard({}, { ...person, photo: 'javascript:bad()', sports: { tennis: { experience: '<img src=x>', level: '<b>bad</b>' } } }, derived);
  assert.match(html, /&lt;민서 &amp; 친구&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&lt;b&gt;bad&lt;\/b&gt;/);
  assert.equal((html.match(/운동 &lt;친구&gt;를 찾아요\./g) || []).length, 1);
  assert.doesNotMatch(html, /javascript:|<img src=x>|<b>bad<\/b>/);
});

test('visitor Kong face has no owner action or duplicate history and supports reduced motion', () => {
  assert.equal(typeof passport.renderPassportCard, 'function');
  const html = passport.renderPassportCard({}, person, derived, { reducedMotion: true });
  assert.match(html, /data-reduced-motion="true"/);
  assert.match(html, /data-kong-total="1"/);
  assert.doesNotMatch(html, /<animate(?:Transform)?\b|data-kong-activity|운동 기록하기/);
});

test('valid profile photo and honest missing identity fields render without fabricated values', () => {
  assert.equal(typeof passport.renderPassportCard, 'function');
  const html = passport.renderPassportCard({}, { id: 'u2', name: '새 친구', photo: 'data:image/png;base64,aGVsbG8=' }, { ...derived, total: 0 });
  assert.match(html, /src="data:image\/png;base64,aGVsbG8="/);
  assert.match(html, /미입력/);
  assert.match(html, /종목을 선택하면 구력이 표시돼요/);
  assert.doesNotMatch(html, /20대|3년|중급/);
});

test('shared Kong history exports real detail links without any identity card or stamps', () => {
  assert.equal(typeof kong.renderKongHistory, 'function');
  const html = kong.renderKongHistory(person, derived, { own: false });
  assert.match(html, /data-action="details" data-id="m1"/);
  assert.match(html, /최근 2주/);
  assert.doesNotMatch(html, /스탬프|stamp-grid|kong-name|href="#\/matches"/);
});
