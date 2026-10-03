import test from 'node:test';
import assert from 'node:assert/strict';

const renderer = await import('./kong.js').catch(() => ({}));
const view = await import('./kong-profile-view.js').catch(() => ({}));
const user = { id: 'u1', name: '<민서 & 친구>', ageRange: '20대', gender: '여성', region: '관악구', chosenSports: ['running', 'tennis'] };
const empty = {
  counts: { tennis: 0, futsal: 0, running: 0 }, itemLevels: { tennis: 0, futsal: 0, running: 0 },
  total: 0, stageIndex: null, conditionIndex: null, daysSinceLastExercise: null,
  recent7: 0, recent14: 0, dailyCounts14: [{ date: '2026-09-20', count: 0 }, { date: '2026-10-03', count: 0 }], recentResults: [],
};
const recorded = {
  ...empty, total: 26, stageIndex: 2, conditionIndex: 3, recent7: 3, recent14: 4, daysSinceLastExercise: 0,
  counts: { tennis: 25, futsal: 0, running: 1 }, itemLevels: { tennis: 3, futsal: 0, running: 1 },
  dailyCounts14: [{ date: '2026-09-20', count: 0 }, { date: '2026-10-03', count: 1 }],
  recentResults: [{ match: { id: 'run-1', date: '2026-10-03', sport: 'running', venue: '<공원>', startTime: '07:00', endTime: '07:35' }, result: { entries: { u1: { distanceKm: 5, paceSec: 420 } } } }],
};

test('renderer exposes the preserved Kong v3 ES module API', () => {
  assert.equal(typeof renderer.render, 'function', 'Kong renderer is implemented');
  assert.equal(typeof renderer.itemIcon, 'function');
  assert.equal(typeof renderer.stageOf, 'function');
  assert.deepEqual(renderer.STAGES.map(stage => stage.name), ['아기', '꼬마', '어린이', '청소년', '어른', '베테랑']);
});

test('static/reduced rendering omits every SMIL tag, including line-boil seed', () => {
  assert.equal(typeof renderer.render, 'function', 'Kong renderer is implemented');
  for (let cond = 0; cond <= 3; cond++) {
    const svg = renderer.render({ cond, stage: 5, items: { tennis: 4, futsal: 4, running: 4 }, motion: false, react: true, enter: 'grow' });
    assert.doesNotMatch(svg, /<animate(?:Transform)?\b/);
    assert.match(svg, /feTurbulence/);
  }
});

test('each SVG uses unique IDs and all local SVG references resolve', () => {
  assert.equal(typeof renderer.render, 'function', 'Kong renderer is implemented');
  const svgs = [renderer.render({ stage: 5, items: { tennis: 4, futsal: 4 } }), renderer.render({ stage: 3, items: { tennis: 2 } }), renderer.itemIcon('tennis', 4)];
  const seen = new Set();
  for (const svg of svgs) {
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    for (const id of ids) { assert.equal(seen.has(id), false, `unique SVG ID ${id}`); seen.add(id); }
    for (const [, id] of svg.matchAll(/url\(#([^\)]+)\)/g)) assert.ok(ids.includes(id), `reference resolves: ${id}`);
  }
  assert.equal(renderer.itemIcon('tennis', 0), '');
});

test('identity and SVG accessibility labels escape untrusted profile text', () => {
  assert.equal(typeof view.renderKongProfile, 'function', 'Profile view is implemented');
  const html = view.renderKongProfile(user, recorded);
  assert.match(html, /&lt;민서 &amp; 친구&gt;/);
  assert.match(html, /&lt;공원&gt;/);
  assert.doesNotMatch(html, /<민서|<공원>/);
  assert.match(renderer.render({ label: '<img onload="bad()">' }), /aria-label="&lt;img onload=&quot;bad\(\)&quot;&gt;"/);
});

test('zero workouts render an honest static baby and an existing activity CTA', () => {
  assert.equal(typeof view.renderKongProfile, 'function', 'Profile view is implemented');
  const html = view.renderKongProfile(user, empty, { reaction: 'react' });
  assert.match(html, /첫 운동/);
  assert.match(html, /href="#\/activity"/);
  assert.match(html, /data-kong-stage="0"/);
  assert.doesNotMatch(html, /<animate(?:Transform)?\b/);
  assert.doesNotMatch(html, /쌩쌩|촉촉|시들시들|쿨쿨|성장 곡선|growth-chart|demo-actions/);
});

test('actual activity renders one shared recent card, clickable real results and chosen main sport', () => {
  assert.equal(typeof view.renderKongProfile, 'function', 'Profile view is implemented');
  const html = view.renderKongProfile(user, recorded, { reducedMotion: true });
  assert.equal((html.match(/data-kong-activity/g) || []).length, 1);
  assert.match(html, /data-action="details" data-id="run-1"/);
  assert.match(html, /5km/);
  assert.match(html, /data-kong-main-sport="running"/);
  assert.match(html, /data-kong-total="26"/);
  assert.match(html, /최근 2주/);
  assert.doesNotMatch(html, /<animate(?:Transform)?\b|성장 곡선|growth-chart|쉬기|초기화|42회/);
});

test('profile photo, biography and selected-sport item levels remain visible without duplicate bio', () => {
  assert.equal(typeof view.renderKongProfile, 'function', 'Profile view is implemented');
  const photo = 'data:image/png;base64,aGVsbG8=';
  const html = view.renderKongProfile({ ...user, photo, avatar: '✳', bio: '함께 뛰고 싶어요.' }, recorded);
  assert.match(html, /src="data:image\/png;base64,aGVsbG8="/);
  assert.equal((html.match(/함께 뛰고 싶어요\./g) || []).length, 1);
  assert.match(html, /data-kong-item="running" data-level="1"/);
  assert.match(html, /data-kong-item="tennis" data-level="3"/);
});
