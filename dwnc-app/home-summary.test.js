import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtendedSeed } from './extended-domain.js';
const summary = await import('./home-summary.js').catch(() => ({}));
const today = '2026-10-03';

test('home stats retain the existing competitive definitions using confirmed attended workouts', () => {
  assert.equal(typeof summary.homeWorkoutStats, 'function');
  const state = createExtendedSeed(today), actor = state.activeUserId;
  const before = structuredClone(state);
  const values = summary.homeWorkoutStats(state, actor, today);
  assert.equal(values.tennis.games, 1);
  assert.equal(values.tennis.winRate, 100);
  assert.equal(values.futsal.games, 1);
  assert.equal(values.futsal.mvp, 0);
  assert.equal(values.running.distanceKm, 5.2);
  assert.deepEqual(state, before);
});

test('pending proposals, duplicate final rows, future and cancelled workouts do not inflate home stats', () => {
  assert.equal(typeof summary.homeWorkoutStats, 'function');
  const state = createExtendedSeed(today), actor = state.activeUserId;
  const baseline = summary.homeWorkoutStats(state, actor, today);
  state.results.push(structuredClone(state.results[0]));
  state.resultProposals = [{ status: 'pending', data: state.results[0] }];
  for (const [suffix, changes, confirmation] of [
    ['pending', {}, {status:'pending'}],
    ['future', {date:'2026-10-04'}, undefined],
    ['cancelled', {status:'cancelled'}, undefined],
    ['absent', {}, undefined],
  ]) {
    const original = state.results.find(result => result.sport === 'running');
    const match = state.matches.find(match => match.id === original.matchId);
    state.matches.push({...structuredClone(match),id:suffix,...changes});
    state.results.push({...structuredClone(original),matchId:suffix,confirmation,attendedIds:suffix==='absent'?[]:original.attendedIds});
  }
  assert.deepEqual(summary.homeWorkoutStats(state, actor, today), baseline);
});

test('no competitive tennis result displays no win rate; empty running has a real zero', () => {
  assert.equal(typeof summary.renderHomeSummary, 'function');
  const state = createExtendedSeed(today), user = state.users.find(user => user.id === state.activeUserId);
  state.results = state.results.filter(result => result.sport === 'tennis').map(result => ({...result,noContest:true}));
  const html = summary.renderHomeSummary(state,user,{total:1},{id:'home-1',mannerHtml:'',today});
  assert.match(html,/승률[\s\S]*?—/);
  assert.doesNotMatch(html,/100%|0%/);
  assert.match(html,/누적 거리[\s\S]*?0<small>km/);
});

test('compact profile strings and images are safe and metric names remain readable Korean', () => {
  assert.equal(typeof summary.renderHomeSummary, 'function');
  const state=createExtendedSeed(today), user={...state.users[0],name:'<민서 & 친구>',photo:'javascript:bad()'};
  const html=summary.renderHomeSummary(state,user,{total:3},{id:'home-2',mannerHtml:'',today});
  assert.match(html,/&lt;민서 &amp; 친구&gt;/);
  assert.doesNotMatch(html,/javascript:|<민서/);
  for(const name of ['테니스','풋살','러닝','경기 수','승률','MVP 선정','누적 거리'])assert.ok(html.includes(name),name);
  assert.match(html,/id="home-2-name"/);
});

test('demo controls require the explicit local demo flag and remain owner only', () => {
  const state=createExtendedSeed(today), user=state.users[0], derived={total:3};
  for (const flag of [undefined,false,'true',1]) {
    const html=summary.renderHomeSummary({...state,demoControls:flag},user,derived,{id:'demo',today});
    assert.doesNotMatch(html,/demo-add-records|demo-reset-records/);
  }
  const html=summary.renderHomeSummary({...state,demoControls:true},user,derived,{id:'demo',today});
  assert.match(html,/data-action="demo-add-records"[^>]*>운동 10회 추가/);
  assert.match(html,/data-action="demo-reset-records"[^>]*>시연 기록 초기화/);
  assert.doesNotMatch(summary.renderHomeSummary({...state,demoControls:true},user,derived,{id:'demo',today,own:false}),/demo-add-records|demo-reset-records/);
});
