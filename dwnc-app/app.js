import * as old from './domain.js';
import * as d from './extended-domain.js';
import { ic, installIcons } from './icons.js';
import * as api from './api.js';
import { deriveKongProfile, koreaToday } from './kong-profile.js';
import { renderKongCharacter, renderKongHistory } from './kong-profile-view.js';
import { renderPassportCard } from './passport-view.js';
import { regionalRanking, matchingSuggestions, isPastSchedule } from './service-model.js';

installIcons();
const root = document.getElementById('app');
// Toast and celebration live in <body>, outside the re-rendered root, so a re-render never cuts them off.
const toastNode = document.createElement('div');
toastNode.className = 'toast'; toastNode.setAttribute('role', 'status'); toastNode.setAttribute('aria-live', 'polite'); toastNode.hidden = true;
document.body.append(toastNode);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const today = old.today;
const weekday = (date) => { const [year, month, day] = date.split('-').map(Number); return ['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()]; };
const dateText = (date) => { const [, month, day] = date.split('-').map(Number); return `${month}월 ${day}일 (${weekday(date)})`; };
const shortDate = (date) => { const [, month, day] = date.split('-').map(Number); return date === today() ? '오늘' : `${month}/${day} ${weekday(date)}`; };
const paceText = (seconds) => seconds ? `${Math.floor(seconds / 60)}′${String(seconds % 60).padStart(2, '0')}″` : '—';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pages = ['home', 'matches', 'community', 'ranking', 'notifications'];
const pageTitle = { community: '커뮤니티', home: '홈', matches: '매칭', activity: '내 운동', people: '친구', groups: '그룹', profile: '프로필', ranking: '랭킹', notifications: '알림' };
let state, revision = 0, loading = true, loadError = null, authMode = 'login', pending = false, modal = null, flash = null, cardUrl = null, cardRequestId = 0;
const emptyFilters = () => ({ sport: '', format: '', region: '', venue: '', date: '', time: '', level: '', query: '', openOnly: true, minOpenSeats: '' });
let filters = emptyFilters();
const drafts = new Map();
const modalStack = [];
let submittedForm = null, returnFocus = null, returnScroll = 0;
let advancedFiltersOpen = false, profileEditOpen = false, listAnimate = false;
let rankFilter = { sport: 'tennis', region: '', venue: '', period: 'month', month: today().slice(0, 7) };
// Motion bookkeeping: what changed since the last render decides which elements animate.
let lastPage = null, lastModalKey = null, pulseId = null, pulseFor = null, pulseUntil = 0, toastTimer = null, closing = false;
let kongReactionTimer = null, kongRewardUserId = null, homeCardFlipped = false, communityTab = 'friends';

function cancelKongReaction(forgetReward = false) {
  clearTimeout(kongReactionTimer);
  kongReactionTimer = null;
  if (forgetReward) kongRewardUserId = null;
}
// Replace only the illustration so reacting never loses keyboard focus or form drafts.
function animateKong() {
  const publicCard = modal?.type === 'profile';
  const button = root.querySelector(`${publicCard ? '.sheet' : '.content'} .passport-back:not([inert]) .kong-mascot`);
  if (!button || !state || (!publicCard && (route() !== 'home' || modal)) || reduceMotion()) return;
  const person = user(publicCard ? modal.id : state.activeUserId);
  const derived = deriveKongProfile(state, person.id, koreaToday());
  if (!derived.total) return;
  cancelKongReaction();
  const art = button.querySelector('.kong-art');
  art.innerHTML = renderKongCharacter(person, derived, { reaction: 'react', reducedMotion: false });
  button.dataset.kongMotion = 'react';
  const sourceUserId = state.activeUserId;
  kongReactionTimer = setTimeout(() => {
    kongReactionTimer = null;
    if (state?.activeUserId !== sourceUserId || !button.isConnected || button.closest('.passport-back')?.inert) return;
    art.innerHTML = renderKongCharacter(person, derived, { reducedMotion: reduceMotion() });
    button.dataset.kongMotion = reduceMotion() ? 'static' : 'idle';
  }, 1200);
}

async function loadState() {
  cancelKongReaction(true);
  const ownsLock = !pending;
  if (ownsLock) { pending = true; root.inert = true; root.setAttribute('aria-busy','true'); }
  try {
    const result = await api.request('/api/state');
    if (state && result.state.activeUserId !== state.activeUserId) { modal = null; modalStack.length = 0; drafts.clear(); profileEditOpen = false; homeCardFlipped = false; }
    state = result.state; revision = result.revision; loadError = null;
    if (modal?.id && ['details','result'].includes(modal.type) && !match(modal.id)) modal = null;
  } catch (error) {
    if (error.status === 401) { state = null; modal = null; drafts.clear(); authMode = 'login'; }
    else loadError = error.message;
  } finally { loading = false; render(); if (ownsLock) { pending = false; root.inert = false; root.removeAttribute('aria-busy'); } }
}

async function save(type, payload, message, icon = 'check') {
  if (pending) return;
  const sourceUserId = state.activeUserId;
  const beforeTotal = type === 'result.save' ? deriveKongProfile(state, sourceUserId, koreaToday()).total : null;
  const submittedDraftKey = submittedForm ? draftKey(submittedForm) : null;
  pending = true; root.inert = true; root.setAttribute('aria-busy','true');
  showToast('저장 중…',false,'clock');
  try {
    const result = await api.command(type,payload,revision,state.activeUserId);
    state = result.state; revision = result.revision;
    if (type === 'result.save' && state.activeUserId === sourceUserId && deriveKongProfile(state, sourceUserId, koreaToday()).total > beforeTotal) { kongRewardUserId = sourceUserId; homeCardFlipped = true; }
    if (result.id) pulseId = result.id;
    if (submittedDraftKey) drafts.delete(submittedDraftKey);
    if (!modal) modalStack.length = 0;
    flash = message ? { text: message, error: false, icon } : null;
    render(); return result;
  } catch (error) {
    if (error.status === 401) { cancelKongReaction(true); state = null; modal = null; drafts.clear(); authMode = 'login'; render(); }
    else if (['REVISION_CONFLICT','SESSION_CHANGED'].includes(error.code)) await loadState();
    throw error;
  } finally { pending = false; root.inert = false; root.removeAttribute('aria-busy'); }
}

function authPage() {
  const signup = authMode === 'signup';
  return `<main class="auth-screen"><a class="brand" href="#/home">DWNC<span>✳</span></a><section class="panel auth-panel"><h1>${signup ? '같이 운동해요' : '다시, 같이 움직여요'}</h1><p>${signup ? '여러 운동, 하나의 프로필' : '내 기록과 운동 친구를 만나세요'}</p><form id="auth-form" class="form">${signup ? '<label>닉네임<input name="name" required maxlength="24" autocomplete="nickname"></label><div class="grid2"><label>활동 지역<input name="region" required maxlength="30" placeholder="관악구"></label><label>연령대<select name="ageRange"><option>20대</option><option>30대</option><option>40대</option><option>50대 이상</option><option>미입력</option></select></label></div><fieldset class="pick"><legend>즐기는 운동</legend>' + old.SPORTS.map(sport => `<label class="pick-chip s-${sport}"><input type="checkbox" name="chosenSports" value="${sport}" checked>${ic(sport)}${old.SPORT_LABEL[sport]}</label>`).join('') + '</fieldset>' : ''}<label>이메일<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>비밀번호<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="10자 이상"></label>${signup ? '<label>비밀번호 확인<input name="confirmPassword" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label>' : ''}<button class="btn primary wide" type="submit">${signup ? '회원가입' : '로그인'}</button></form><button class="text-btn" data-action="auth-mode" data-id="${signup ? 'login' : 'signup'}">${signup ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 회원가입'}</button></section></main>`;
}
function showToast(text, error = false, icon = error ? 'alert' : 'check') {
  const node = toastNode;
  node.innerHTML = `${ic(icon)}<span>${esc(text)}</span>`;
  node.className = `toast ${error ? 'error' : ''}`;
  node.hidden = false;
  void node.offsetWidth; node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.classList.remove('show'); toastTimer = setTimeout(() => { node.hidden = true; }, 260); }, error ? 4200 : 2400);
}
function feedback(message) { showToast(message, true); }
// Form drafts belong to a user and a form, never to a transient DOM tree.
function draftKey(form) { return `${state.activeUserId}:${form.id}:${form.dataset.id || ''}:${form.id === 'note-form' ? today() : ''}`; }
function rememberDraft(event) {
  const form = event.target.closest('form');
  if (!form || !['note-form', 'profile-form', 'create-form', 'result-form', 'group-form'].includes(form.id) || event.target.type === 'file') return;
  drafts.set(draftKey(form), [...form.elements].filter(el => el.name && el.type !== 'file').map(el => ({ name: el.name, value: el.value, checked: el.checked, type: el.type })));
}
function restoreDrafts() {
  for (const form of root.querySelectorAll('form[id]')) {
    const draft = drafts.get(draftKey(form));
    if (!draft) continue;
    for (const el of form.elements) {
      const value = draft.find(item => item.name === el.name && (!['checkbox', 'radio'].includes(el.type) || item.value === el.value));
      if (!value || el.type === 'file') continue;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = value.checked;
      else el.value = value.value;
    }
  }
  syncProfileSports();
}
function syncProfileSports() {
  const form = root.querySelector('#profile-form');
  if (!form) return;
  const chosen = [...form.querySelectorAll('[name="chosenSports"]:checked')].map(el => el.value);
  for (const fieldset of form.querySelectorAll('[data-sport-editor]')) {
    fieldset.hidden = !chosen.includes(fieldset.dataset.sportEditor);
    fieldset.disabled = fieldset.hidden;
  }
}
function focusKey(element) {
  if (!element) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.dataset.action) return ['action', 'id', 'user', 'kind'].filter(key => element.dataset[key]).map(key => `[data-${key}="${CSS.escape(element.dataset[key])}"]`).join('');
  return null;
}
function openModal(next, opener = document.activeElement) {
  if (modal) modalStack.push({ modal, focus: focusKey(opener), scroll: root.querySelector('.sheet')?.scrollTop || 0 });
  else { returnFocus = focusKey(opener); returnScroll = window.scrollY; }
  modal = next;
  render();
}
function finishClose() {
  cardRequestId++;
  const parent = modalStack.pop();
  modal = parent?.modal || null;
  render();
  const target = parent?.focus || returnFocus;
  if (target) root.querySelector(target)?.focus({ preventScroll: true });
  if (parent) root.querySelector('.sheet')?.scrollTo(0, parent.scroll);
  else window.scrollTo({ top: returnScroll, behavior: 'instant' });
}
function closeModal() {
  if (closing) return;
  const backdrop = root.querySelector('.backdrop');
  if (!backdrop || modalStack.length || reduceMotion()) { finishClose(); return; }
  closing = true; backdrop.classList.add('leaving');
  setTimeout(() => { closing = false; finishClose(); }, 180);
}
function routeModal() {
  modalStack.length = 0; returnFocus = null; returnScroll = 0;
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('match');
  modal = id ? { type: 'details', id } : null;
}
root.addEventListener('input', rememberDraft);
root.addEventListener('change', rememberDraft);

function route() { const name = location.hash.replace(/^#\//, '').split('?')[0]; const canonical = { profile: 'home', activity: 'matches', people: 'community', groups: 'community' }[name] || name; return pages.includes(canonical) ? canonical : 'home'; }
function user(id) { return state.users.find((item) => item.id === id); }
function group(id) { return state.groups.find((item) => item.id === id); }
function match(id) { return state.matches.find((item) => item.id === id); }
function name(id) { return user(id)?.name || '알 수 없음'; }
function avatar(id, size = '') { const person = user(id); return `<span class="avatar ${size}" title="${esc(person?.name)}">${person?.photo ? `<img src="${esc(person.photo)}" alt="">` : esc(person?.avatar || person?.name?.slice(-1) || '?')}</span>`; }
function sportIcon(sport, size = '') { return `<span class="sport ${sport} ${size}" title="${old.SPORT_LABEL[sport]}">${ic(sport)}</span>`; }
function select(values, selected, placeholder = '') { return `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${values.map((value) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('')}`; }
function myStatus(item) { const application = item.applications.find(a => a.userId === state.activeUserId); return item.hostId === state.activeUserId ? 'host' : application?.closedReason ? 'expired' : application?.status || ''; }
function isDone(item) { return old.isCompleted(state, item.id); }
const pill = (cls, icon, text) => `<span class="pill ${cls}">${icon ? ic(icon) : ''}${text}</span>`;
function badge(item) {
  if (item.status === 'cancelled') return pill('bad', 'x', '취소');
  if (isDone(item)) return pill('done', 'check', '완료');
  if (d.recruitmentClosed(item)) return pill('mute', 'lock', '마감');
  const status = myStatus(item);
  if (status === 'host') return pill('mine', 'flag', '내 자리');
  if (status === 'pending') return pill('wait', 'clock', '대기');
  if (status === 'accepted') return pill('done', 'check', '확정');
  if (status === 'rejected') return pill('bad', 'x', '거절');
  if (status === 'expired') return pill('mute', 'lock', '종료');
  return old.openSeats(item) ? pill('open', '', `${old.openSeats(item)}자리`) : pill('mute', 'lock', '마감');
}
function seatDots(item) {
  const taken = old.participants(item).length;
  if (item.capacity > 8) return `<span class="seats" title="${taken}/${item.capacity}명">${ic('users')}${taken}/${item.capacity}</span>`;
  return `<span class="seats" title="${taken}/${item.capacity}명">${Array.from({ length: item.capacity }, (_, index) => `<i class="${index < taken ? 'on' : ''}"></i>`).join('')}</span>`;
}
function avatarStack(ids, limit = 4) { return `<span class="stack">${ids.slice(0, limit).map((id) => avatar(id, 'xs')).join('')}${ids.length > limit ? `<span class="avatar xs more">+${ids.length - limit}</span>` : ''}</span>`; }
function resultSummary(result, item, userId) {
  if (!result) return '';
  if (item.sport === 'tennis') {
    if (result.noContest) return '경기 미성립';
    const score = result.scoreA === null ? '' : ` ${result.scoreA}:${result.scoreB}`;
    if (!result.attendedIds.includes(userId)) return `${result.teams[result.winnerTeam].map(name).join('·')} 승${score}`;
    return `${result.teams[result.winnerTeam].includes(userId) ? '승리' : '패배'}${score}`;
  }
  if (item.sport === 'futsal') return `${result.teamOutcome === 'win' ? '승' : result.teamOutcome === 'loss' ? '패' : '무'} ${result.scoreFor}:${result.scoreAgainst}${result.mvpUserId === userId ? ' · MVP' : ''}`;
  const entry = result.entries[userId]; return entry ? `${entry.distanceKm}km · ${paceText(entry.paceSec)}` : '불참';
}
function navLink(page, label, icon, badgeCount = 0) { const active = route() === page; return `<a href="#/${page}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span>${badgeCount ? `<b class="dot-count">${badgeCount}</b>` : ''}</a>`; }
const fitIcon = { friend: 'users', group: 'flag', together: 'users', new: 'sparkle', level: 'target', manner: 'star' };
function fitChips(item, limit = 3) {
  const chips = d.matchFit(state, item, state.activeUserId).slice(0, limit);
  return chips.length ? `<div class="fits">${chips.map((chip) => `<span class="fit ${chip.kind}">${ic(fitIcon[chip.kind])}${esc(chip.text.replace('모집자 매너 ', ''))}</span>`).join('')}</div>` : '';
}
function matchCard(item) {
  return `<button type="button" class="mcard ${item.sport}" data-action="details" data-id="${esc(item.id)}"><span class="mcard__top">${sportIcon(item.sport)}<span class="mcard__kind">${d.FORMAT_LABEL[item.format]}</span>${item.visibility !== 'public' ? `<span class="mcard__vis" title="${d.VISIBILITY_LABEL[item.visibility]}">${ic(item.visibility === 'group' ? 'flag' : 'users')}</span>` : ''}${badge(item)}</span><strong class="mcard__title">${esc(item.title)}</strong><span class="meta">${ic('calendar')}${shortDate(item.date)} ${esc(item.startTime)}</span><span class="meta">${ic('pin')}${esc(item.venue)}</span>${fitChips(item)}<span class="mcard__foot">${seatDots(item)}<span class="level">${esc(item.level)}</span>${ic('right', 'chev')}</span></button>`;
}
function emptyState(icon, text, actions = '') { return `<div class="empty">${ic(icon)}<p>${text}</p>${actions}</div>`; }

const sportColor = { tennis: '#c7e78a', futsal: '#eac79a', running: '#8fd6bd' };
function sportMetric(stats, sport) {
  if (sport === 'tennis') return { value: stats.tennis.games ? `${stats.tennis.winRate}%` : '—', label: '승률', sub: `${stats.tennis.wins}승 ${stats.tennis.losses}패` };
  if (sport === 'futsal') return { value: String(stats.futsal.mvp), label: 'MVP', sub: `${stats.futsal.games}경기` };
  return { value: paceText(stats.running.paceSec), label: '페이스', sub: `${stats.running.distanceKm}km` };
}
function homePage(me) { return profilePage(me); }

function stat(icon, value, label, cls = '') { return `<div class="stat ${cls}">${ic(icon)}<strong>${esc(value)}</strong><small>${esc(label)}</small></div>`; }
function workoutRow(item, me) {
  const result = state.results.find(entry => entry.matchId === item.id);
  return `<button type="button" class="row" data-action="details" data-id="${esc(item.id)}">${sportIcon(item.sport)}<span class="row__body"><strong>${esc(item.title)}</strong><span class="meta">${ic('calendar')}${shortDate(item.date)} ${esc(item.startTime)}–${esc(item.endTime)}</span><span class="meta">${ic('pin')}${esc(item.venue)}</span>${result ? `<span class="row__res">${esc(resultSummary(result,item,me.id))}</span>` : ''}</span><span class="row__end">${badge(item)}</span></button>`;
}
function mySchedule(me) {
  return state.matches.filter(item => !isDone(item) && item.status !== 'cancelled' && (item.hostId === me.id || item.applications.some(a => a.userId === me.id && !a.closedReason && ['accepted','pending'].includes(a.status))))
    .sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}
function scheduleSection(me) {
  const mine = mySchedule(me), current = mine.filter(item => !isPastSchedule(item)), past = mine.filter(item => isPastSchedule(item));
  const pending = mine.filter(item => item.hostId === me.id).reduce((total,item) => total + item.applications.filter(a => a.status === 'pending' && !a.closedReason).length,0);
  return `<section class="block schedule-section"><div class="block__head"><h2>내 운동 일정</h2><button type="button" class="btn soft sm" data-action="recent-records">${ic('clock')}최근 기록</button></div><div class="stats">${stat('calendar',current.filter(item=>item.date===koreaToday()).length,'오늘')}${stat('clock',current.length,'예정·신청')}${stat('userplus',pending,'응답 대기')}</div><div class="rows">${current.length ? current.map(item=>workoutRow(item,me)).join('') : emptyState('calendar','예정된 운동이 없어요','<p class="hint">아래에서 함께할 운동을 찾아보세요.</p>')}</div>${past.length ? `<details class="unfinished-records"><summary>기록을 기다리는 지난 일정 ${past.length}</summary><div class="rows">${past.map(item=>workoutRow(item,me)).join('')}</div></details>` : ''}</section>`;
}

function sportTabs(action, current, withAll = true) {
  const items = [...(withAll ? [['', '전체', 'grid']] : []), ...old.SPORTS.map((sport) => [sport, old.SPORT_LABEL[sport], sport])];
  return `<div class="seg sports-seg" role="group" aria-label="종목">${items.map(([value, label, icon]) => `<button type="button" class="${value ? `s-${value}` : ''}" data-action="${action}" data-id="${value}" aria-pressed="${current === value}">${ic(icon)}<span>${label}</span></button>`).join('')}</div>`;
}
function matchesPage(me) {
  const available = d.filterMatches(state, me.id, filters);
  const suggestions = matchingSuggestions(state, me.id, { today: koreaToday(), limit: 3 });
  const recommendations = `<section class="block recommendation-section"><div class="block__head"><h2>내 일정에 맞는 운동 친구</h2></div><p class="hint">선택한 종목과 지역에서, 확정 일정과 시간이 겹치지 않는 모집이에요.</p>${suggestions.length ? suggestions.map(({match:item,reasons}) => `<article class="recommendation"><p class="recommendation-reason">${reasons.map(esc).join(' · ')}</p>${matchCard(item)}<button type="button" class="row recommendation-host" data-action="view-profile" data-id="${esc(item.hostId)}">${avatar(item.hostId)}<span class="row__body"><strong>${esc(name(item.hostId))}</strong><small>운동 친구 신분증 보기</small></span>${ic('right')}</button></article>`).join('') : emptyState('users','일정에 맞는 열린 모집이 아직 없어요')}</section>`;
  const regions = [...new Set(d.visibleMatches(state, me.id).map(item => item.region))].sort();
  const advancedCount = ['format', 'venue', 'date', 'time', 'level', 'minOpenSeats'].filter(key => filters[key]).length;
  return `<div class="head"><h1>매칭 · 내 운동</h1><button class="btn primary" data-action="create" aria-label="자리 만들기">${ic('plus')}<span>자리 만들기</span></button></div>${scheduleSection(me)}${recommendations}<section class="block matching-search"><div class="block__head"><h2>모든 모집 찾기</h2></div>${sportTabs('filter-sport', filters.sport)}<form id="filter-form" class="filters" role="search"><input type="hidden" name="sport" value="${esc(filters.sport)}"><label class="search">${ic('search')}<span class="sr">검색</span><input id="filter-query" name="query" value="${esc(filters.query)}" placeholder="장소, 제목" autocomplete="off"></label><div class="filters__row"><label class="chip-select">${ic('pin')}<span class="sr">지역</span><select name="region">${select(regions, filters.region, '전체 지역')}</select></label><label class="toggle-chip"><input type="checkbox" name="openOnly" ${filters.openOnly ? 'checked' : ''}>${ic('check')}<span>신청 가능</span></label><button type="button" class="icon-btn ${advancedFiltersOpen || advancedCount ? 'on' : ''}" data-action="toggle-filters" aria-expanded="${advancedFiltersOpen}" aria-label="상세 필터">${ic('sliders')}${advancedCount ? `<b class="dot-count">${advancedCount}</b>` : ''}</button></div>${advancedFiltersOpen ? `<div class="filters__more"><label>방식<select name="format"><option value="">전체</option>${Object.entries(d.FORMAT_LABEL).map(([value, label]) => `<option value="${value}" ${filters.format === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>날짜<input type="date" name="date" value="${esc(filters.date)}"></label><label>시간<select name="time"><option value="">전체</option>${[['morning', '오전'], ['afternoon', '오후'], ['evening', '저녁']].map(([value, label]) => `<option value="${value}" ${filters.time === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>수준<select name="level">${select(old.LEVELS, filters.level, '전체')}</select></label><label>빈자리<select name="minOpenSeats">${select(['1', '2', '3', '4'], filters.minOpenSeats, '상관없음')}</select></label><label>장소<input name="venue" value="${esc(filters.venue)}" placeholder="구장"></label><button type="button" class="btn ghost sm" data-action="reset-filters">${ic('refresh')}초기화</button></div>` : `<input type="hidden" name="format" value="${esc(filters.format)}"><input type="hidden" name="date" value="${esc(filters.date)}"><input type="hidden" name="time" value="${esc(filters.time)}"><input type="hidden" name="level" value="${esc(filters.level)}"><input type="hidden" name="minOpenSeats" value="${esc(filters.minOpenSeats)}"><input type="hidden" name="venue" value="${esc(filters.venue)}">`}</form><div class="count">${available.length}개</div><div class="cards ${listAnimate ? 'enter' : ''}">${available.length ? available.map(matchCard).join('') : emptyState('search', '조건에 맞는 자리가 없어요', `<button class="btn ghost sm" data-action="reset-filters">${ic('refresh')}초기화</button><button class="btn primary sm" data-action="create">${ic('plus')}만들기</button>`)}</div></section>`;
}

function recordsModal(personId, me) {
  const person = user(personId); if (!person) return '';
  const derived = deriveKongProfile(state,personId,koreaToday());
  return sheet(personId === me.id ? '내 운동 기록' : `${person.name}님의 운동 기록`, `<div class="activity-records">${renderKongHistory(person,derived,{own:personId===me.id})}<div class="record-summary"><span>누적 <b>${derived.total}회</b></span><span>최근 2주 <b>${derived.recent14}회</b></span></div><section class="block"><h2>전체 운동 기록</h2><div class="rows">${derived.recentResults.length ? derived.recentResults.map(({match:item})=>workoutRow(item,person)).join('') : emptyState('clock','아직 저장한 운동 기록이 없어요')}</div></section>${personId === me.id ? '<div class="sheet__actions"><a class="btn primary wide" href="#/home?face=kong">콩 키우기 카드 보기</a></div>' : ''}</div>`,{wide:true});
}

function profilePage(me) {
  const friends = d.friendsOf(state, me.id).length, groups = state.groups.filter((item) => item.memberIds.includes(me.id)).length;
  const incoming = state.friendRequests.filter((request) => request.toId === me.id && request.status === 'pending').length + state.invitations.filter((invite) => invite.toId === me.id && invite.status === 'pending').length;
  const editor = `<form id="profile-form" class="editor"><div class="photo-row">${avatar(me.id, 'lg')}<label class="btn soft sm">${ic('camera')}사진<input id="profile-photo" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label>${me.photo ? `<button type="button" class="btn ghost sm" data-action="remove-photo">${ic('trash')}삭제</button>` : ''}</div><div class="grid2"><label>닉네임<input name="name" required maxlength="24" value="${esc(me.name)}"></label><label>지역<input name="region" required maxlength="30" value="${esc(me.region)}"></label><label>나이 · 연령대<input name="ageRange" required value="${esc(me.ageRange)}"></label><label>성별<select name="gender">${select(['미입력', '여성', '남성', '기타'], me.gender)}</select></label><label>아이콘<select name="avatar">${select(d.AVATARS, me.avatar)}</select></label></div><fieldset class="pick"><legend>종목</legend>${old.SPORTS.map((sport) => `<label class="pick-chip s-${sport}"><input type="checkbox" name="chosenSports" value="${sport}" ${me.chosenSports.includes(sport) ? 'checked' : ''}>${ic(sport)}${old.SPORT_LABEL[sport]}</label>`).join('')}</fieldset><label>소개<textarea name="bio" maxlength="180" rows="2">${esc(me.bio)}</textarea></label>${old.SPORTS.map((sport) => `<fieldset class="sport-edit s-${sport}" data-sport-editor="${sport}"><legend>${ic(sport)}${old.SPORT_LABEL[sport]}</legend><div class="grid2"><label>구력<input name="${sport}-experience" required value="${esc(me.sports[sport].experience)}"></label><label>수준<select name="${sport}-level">${select(old.LEVELS, me.sports[sport].level)}</select></label><label>${sport === 'tennis' ? '방식' : sport === 'futsal' ? '포지션' : '거리'}<input name="${sport}-preference" required value="${esc(me.sports[sport].preference)}"></label>${sport === 'tennis' ? `<label>NTRP<input type="number" name="tennis-ntrp" min="1" max="7" step="0.5" required value="${esc(me.sports.tennis.ntrp)}"></label>` : ''}</div></fieldset>`).join('')}<div class="sticky-actions"><button class="btn primary wide" type="submit">${ic('check')}저장</button></div></form>`;
  const derived = deriveKongProfile(state,me.id,koreaToday());
  const upcoming = mySchedule(me).filter(item => !isPastSchedule(item));
  const note = state.dailyNotes[me.id]?.[today()] || '';
  return `<div class="passport-home"><div class="head"><h1>홈</h1><div class="head__actions"><button class="icon-btn ${profileEditOpen ? 'on' : ''}" data-action="toggle-edit" aria-expanded="${profileEditOpen}" aria-label="프로필 편집">${ic('edit')}</button><button class="icon-btn" data-action="export-card" data-kind="profile" aria-label="프로필 카드 공유">${ic('share')}</button></div></div>${profileEditOpen ? `<section class="panel edit-panel">${editor}</section>` : ''}${renderPassportCard(state,me,derived,{flipped:homeCardFlipped,reducedMotion:reduceMotion(),own:true})}<a href="#/matches" class="row home-next-workout">${ic('calendar')}<span class="row__body"><strong>${upcoming.length ? esc(upcoming[0].title) : '다음 운동을 함께 찾아볼까요?'}</strong><span class="meta">${upcoming.length ? `${shortDate(upcoming[0].date)} ${esc(upcoming[0].startTime)} · ${esc(upcoming[0].venue)}` : '내 일정과 운동 친구를 한곳에서'}</span></span>${ic('right')}</a>${renderKongHistory(me,derived)}<button type="button" class="btn soft wide" data-action="recent-records">${ic('clock')}전체 운동 기록 보기</button><form id="note-form" class="note"><label class="sr" for="daily-note">오늘의 한 줄</label>${ic('edit')}<input id="daily-note" name="note" maxlength="140" value="${esc(note)}" placeholder="오늘의 한 줄"><button class="icon-btn solid" type="submit" aria-label="한 줄 저장">${ic('check')}</button></form><div class="links"><a class="link-tile" href="#/community?tab=friends">${ic('users')}<span>친구</span><b>${friends}</b>${incoming ? `<b class="dot-count">${incoming}</b>` : ''}</a><a class="link-tile" href="#/community?tab=groups">${ic('flag')}<span>그룹</span><b>${groups}</b></a></div><button class="text-btn" data-action="logout">로그아웃</button></div>`;

}

function rankingPage(me) {
  const regions = [...new Set(state.users.map(person=>person.region).filter(Boolean))].sort();
  const region = rankFilter.region || me.region;
  const rows = regionalRanking(state,rankFilter.sport,{region,today:koreaToday()});
  const career = months => months ? `${Math.floor(months/12) ? Math.floor(months/12)+'년 ' : ''}${months%12 ? months%12+'개월' : ''}`.trim() : '미입력';
  return `<div class="head"><h1>지역 랭킹</h1>${pill('ghost','pin',esc(region))}</div><p class="hint">공개 운동 기록으로 같은 지역 친구들의 경기와 꾸준함을 함께 봐요.</p>${sportTabs('rank-sport',rankFilter.sport,false)}<form id="ranking-form" class="filters"><label class="chip-select">${ic('pin')}<span>활동 지역</span><select name="region">${select(regions,region)}</select></label></form><section class="regional-rank"><div class="rows ${listAnimate ? 'enter' : ''}">${rows.length ? rows.map((row,index)=>`<button type="button" class="row regional-rank-row ${row.user.id===me.id?'me':''}" data-action="view-profile" data-id="${esc(row.user.id)}"><b class="rank__n">${index+1}</b>${avatar(row.user.id)}<span class="row__body"><strong>${esc(row.user.name)}${row.user.id===me.id ? ' <small>나</small>' : ''}</strong><span class="rank-metrics"><span>${rankFilter.sport==='running' ? '승률 미적용' : row.stats[rankFilter.sport].games ? `승률 ${row.winRate}%` : '경기 없음'}</span><span>구력 ${esc(row.user.sports[rankFilter.sport].experience || career(row.careerMonths))}</span><span>최근 2주 ${row.recent14}회</span></span></span><span class="rank__v"><b>${row.score.toFixed(1)}</b><small>활동 점수</small></span></button>`).join('') : emptyState('trophy','아직 랭킹에 반영할 공개 기록이나 구력이 없어요')}</div></section><details class="ranking-policy"><summary>랭킹 계산 기준</summary><p>전체 공개 운동 기록 기준으로 승률 50점 + 구력 20점 + 최근 2주 운동 30점을 계산해요. 구력은 직접 입력한 연·개월을 최대 10년까지, 최근 기록은 이 종목의 실제 참석 운동을 최대 6회까지 반영해요.</p><p>경기가 없거나 구력을 해석할 수 없으면 해당 점수는 0점이에요. 러닝은 승률을 적용하지 않아 최대 50점이에요. 동점은 최근 운동, 승률, 닉네임 순으로 정렬해요.</p><p>현재 계산 비중은 서비스 검토용이며, 공식 실력 평가가 아니에요.</p></details>`;
}

function communityPage(me) {
  const content = communityTab === 'groups' ? groupsPage(me).replace('<h1>그룹</h1>','<h2>그룹</h2>') : peoplePage(me).replace('<h1>친구</h1>','<h2>친구</h2>');
  return `<div class="head"><h1>커뮤니티</h1></div><p class="hint">함께 움직이는 친구와 그룹을 만나요.</p><div class="seg community-tabs" role="group" aria-label="커뮤니티">${[['friends','친구','users'],['groups','그룹','flag']].map(([value,label,icon])=>`<button type="button" data-action="community-tab" data-id="${value}" aria-pressed="${communityTab===value}">${ic(icon)}${label}</button>`).join('')}</div><section class="community-content" data-community-tab="${communityTab}">${content}</section>`;
}

function peoplePage(me) {
  const friends = d.friendsOf(state, me.id);
  const incoming = state.friendRequests.filter((request) => request.toId === me.id && request.status === 'pending');
  const outgoing = state.friendRequests.filter((request) => request.fromId === me.id && request.status === 'pending');
  const invites = state.invitations.filter((invite) => invite.toId === me.id && invite.status === 'pending');
  const personRow = (id, end) => `<div class="row static">${avatar(id)}<span class="row__body"><strong>${esc(name(id))}</strong><span class="meta">${ic('pin')}${esc(user(id).region)} ${ic('star')}${d.mannerFor(state, id).toFixed(1)}</span></span><span class="row__end">${end}</span></div>`;
  const decide = (action, id, yes, no) => `<button class="icon-btn solid ok" data-action="${action}" data-id="${esc(id)}" data-decision="${yes}" aria-label="수락">${ic('check')}</button><button class="icon-btn" data-action="${action}" data-id="${esc(id)}" data-decision="${no}" aria-label="거절">${ic('x')}</button>`;
  return `<div class="head"><h1>친구</h1></div><div class="code-card"><span class="code-card__label">No.</span><strong>${esc(me.friendCode)}</strong><button class="icon-btn" data-action="copy-code" data-id="${esc(me.friendCode)}" aria-label="친구 코드 복사">${ic('copy')}</button></div><form id="friend-form" class="send-row"><label class="search">${ic('userplus')}<span class="sr">친구 코드</span><input name="code" required placeholder="DWNC-0002" autocomplete="off"></label><button class="icon-btn solid" type="submit" aria-label="친구 신청 보내기">${ic('send')}</button></form>${incoming.length ? `<section class="block"><h2 class="sub">${ic('bell')}받은 신청</h2><div class="rows">${incoming.map((request) => personRow(request.fromId, decide('friend-decide', request.id, 'accepted', 'rejected'))).join('')}</div></section>` : ''}${invites.length ? `<section class="block"><h2 class="sub">${ic('send')}운동 초대</h2><div class="rows">${invites.map((invite) => { const item = match(invite.matchId); return `<div class="row static">${sportIcon(item.sport)}<span class="row__body"><strong>${esc(item.title)}</strong><span class="meta">${ic('calendar')}${shortDate(item.date)} ${ic('user')}${esc(name(invite.fromId))}</span></span><span class="row__end">${decide('invite-decide', invite.id, 'accepted', 'declined')}</span></div>`; }).join('')}</div></section>` : ''}<section class="block"><h2 class="sub">${ic('users')}내 친구 <b>${friends.length}</b>${outgoing.length ? pill('wait', 'clock', `${outgoing.length}`) : ''}</h2>${friends.length ? `<div class="rows">${friends.map((id) => `<button type="button" class="row" data-action="view-profile" data-id="${esc(id)}">${avatar(id)}<span class="row__body"><strong>${esc(name(id))}</strong><span class="meta">${ic('pin')}${esc(user(id).region)} ${ic('star')}${d.mannerFor(state, id).toFixed(1)}</span></span>${ic('right', 'chev')}</button>`).join('')}</div>` : emptyState('users', '코드로 첫 친구를 추가해 보세요')}</section><section class="block"><h2 class="sub">${ic('globe')}둘러보기</h2><div class="people">${state.users.filter((person) => person.id !== me.id).map((person) => `<button class="person" type="button" data-action="view-profile" data-id="${esc(person.id)}">${avatar(person.id, 'lg')}<strong>${esc(person.name)}</strong><span class="person__sports">${person.chosenSports.map((sport) => sportIcon(sport, 'xs')).join('')}</span></button>`).join('')}</div></section>`;
}

function groupsPage(me) {
  return `<div class="head"><h1>그룹</h1><button class="btn primary" data-action="create-group" aria-label="그룹 만들기">${ic('plus')}<span>그룹 만들기</span></button></div><div class="cards">${state.groups.length ? state.groups.map((item) => { const member = item.memberIds.includes(me.id); return `<button type="button" class="gcard ${member ? 'member' : ''}" data-action="group-detail" data-id="${esc(item.id)}"><span class="gcard__mark">${ic('flag')}</span><span class="gcard__body"><strong>${esc(item.name)}</strong><span class="meta">${ic('pin')}${esc(item.region)} ${ic('users')}${item.memberIds.length}</span>${item.description ? `<small>${esc(item.description)}</small>` : ''}</span>${avatarStack(item.memberIds, 3)}${member ? ic('right', 'chev') : pill('open', 'plus', '가입')}</button>`; }).join('') : emptyState('flag', '첫 그룹을 만들어 보세요')}</div>`;
}

function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return '방금';
  if (diff < 60) return `${Math.floor(diff)}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / 1440)}일 전`;
}
function notificationsPage(me) {
  const notices = state.notifications.filter((item) => item.userId === me.id);
  return `<div class="head"><h1>알림</h1>${notices.some((item) => !item.read) ? `<button class="icon-btn" data-action="read-all" aria-label="모두 읽음" title="모두 읽음">${ic('checks')}</button>` : ''}</div><div class="rows">${notices.length ? notices.map((notice) => `<button class="row notice ${notice.read ? '' : 'unread'}" type="button" data-action="open-notice" data-id="${esc(notice.id)}"><span class="notice__dot"></span><span class="row__body"><strong>${esc(notice.text)}</strong><span class="meta">${ic('clock')}${relTime(notice.at)}</span></span>${ic('right', 'chev')}</button>`).join('') : emptyState('bell', '새 알림이 없어요')}</div>`;
}

function sheet(title, body, { wide = false, icon = '', tone = '' } = {}) {
  return `<div class="sheet ${wide ? 'wide' : ''} ${tone}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><span class="grip" aria-hidden="true"></span><div class="sheet__head">${modalStack.length ? `<button type="button" class="icon-btn" data-action="close" aria-label="이전 화면">${ic('left')}</button>` : ''}<h2 id="modal-title">${icon}${esc(title)}</h2><button type="button" data-action="close" class="icon-btn" aria-label="닫기">${ic('x')}</button></div>${body}</div>`;
}
function createModal(me, presetGroupId = null) {
  const memberGroups = state.groups.filter((item) => item.memberIds.includes(me.id));
  const body = `<form id="create-form" class="form"><fieldset class="seg sports-seg pick-seg"><legend class="sr">종목</legend>${old.SPORTS.map((sport) => `<label class="s-${sport}"><input type="radio" name="sport" value="${sport}" ${sport === 'tennis' ? 'checked' : ''}>${ic(sport)}<span>${old.SPORT_LABEL[sport]}</span></label>`).join('')}</fieldset><label>제목<input name="title" maxlength="60" required placeholder="오늘 저녁 랠리"></label><div class="grid2"><label>${ic('pin')}장소<input name="venue" maxlength="60" required placeholder="구장, 공원"></label><label>지역<input name="region" maxlength="30" required value="${esc(me.region)}"></label></div><label>${ic('calendar')}날짜<input type="date" name="date" required min="${today()}" value="${today()}"></label><div class="grid2"><label>${ic('clock')}시작<input type="time" name="startTime" required value="19:00"></label><label>종료<input type="time" name="endTime" required value="20:00"></label></div><div class="grid2"><label>방식<select name="format" id="create-format"><option value="singles">단식</option><option value="doubles">복식</option></select></label><label>${ic('users')}정원<input type="number" id="create-capacity" name="capacity" min="2" max="20" required value="2"></label></div><div class="grid2"><label>${ic('target')}수준<select name="level">${select(old.LEVELS, '무관')}</select></label><label>${ic('globe')}공개<select name="visibility" id="create-visibility"><option value="public" ${presetGroupId ? '' : 'selected'}>전체</option><option value="friends">친구</option><option value="group" ${presetGroupId ? 'selected' : ''}>그룹</option></select></label></div><label id="group-select-label" ${presetGroupId ? '' : 'hidden'}>${ic('flag')}그룹<select name="groupId">${memberGroups.map((item) => `<option value="${esc(item.id)}" ${presetGroupId === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label>${ic('note')}설명<textarea name="description" required maxlength="500" rows="2" placeholder="함께할 운동을 짧게"></textarea></label><div class="sheet__actions"><button type="submit" class="btn primary wide">${ic('check')}등록</button></div></form>`;
  return sheet('자리 만들기', body, { wide: true });
}
function groupCreateModal(me) {
  const body = `<form id="group-form" class="form"><label>이름<input name="name" maxlength="40" required placeholder="관악 러너스"></label><label>${ic('pin')}지역<input name="region" maxlength="30" required value="${esc(me.region)}"></label><label>소개<textarea name="description" maxlength="300" rows="2"></textarea></label><div class="sheet__actions"><button type="submit" class="btn primary wide">${ic('check')}만들기</button></div></form>`;
  return sheet('그룹 만들기', body);
}
function groupDetailModal(item, me) {
  if (!item) return '';
  const member = item.memberIds.includes(me.id);
  const schedule = member ? state.matches.filter((entry) => entry.groupId === item.id).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const summary = d.groupSummary(state, item.id);
  const stat = (icon, value, label) => `<div class="stat">${ic(icon)}<strong>${value}</strong><small>${label}</small></div>`;
  const body = `<div class="info"><span>${ic('pin')}${esc(item.region)}</span><span>${ic('flag')}${esc(name(item.ownerId))}</span></div>${item.description ? `<p class="desc">${esc(item.description)}</p>` : ''}<div class="people compact">${item.memberIds.map((id) => `<button class="person" data-action="view-profile" data-id="${esc(id)}">${avatar(id)}<strong>${esc(name(id))}</strong></button>`).join('')}</div>${member ? `<div class="stats">${stat('check', summary.games, '완료')}${stat('futsal', `${summary.futsalWinRate}%`, `풋살 ${summary.futsalGames}경기`)}${stat('tennis', summary.tennisInternalGames, '테니스')}</div>${schedule.length ? `<div class="rows">${schedule.map((entry) => `<button type="button" class="row" data-action="details" data-id="${esc(entry.id)}">${sportIcon(entry.sport)}<span class="row__body"><strong>${esc(entry.title)}</strong><span class="meta">${ic('calendar')}${shortDate(entry.date)} ${esc(entry.startTime)}</span></span><span class="row__end">${badge(entry)}</span></button>`).join('')}</div>` : ''}<div class="mini-ranks">${old.SPORTS.map((sport) => { const leaders = d.ranking(state, sport, { groupId: item.id }); return leaders.length ? `<div>${sportIcon(sport, 'xs')}${leaders.slice(0, 3).map((row, index) => `<span><b>${index + 1}</b>${esc(row.user.name)}</span>`).join('')}</div>` : ''; }).join('')}</div><div class="sheet__actions"><button class="btn primary wide" data-action="create-group-match" data-id="${esc(item.id)}">${ic('plus')}그룹 운동 만들기</button></div>` : `<div class="sheet__actions"><button class="btn primary wide" data-action="join-group" data-id="${esc(item.id)}">${ic('plus')}가입</button></div>`}`;
  return sheet(item.name, body, { wide: true, icon: ic('flag') });
}

function detailModal(item, me) {
  if (!d.canViewMatch(state, item, me.id)) return sheet('볼 수 없는 자리', emptyState('lock', '공개되지 않은 자리예요'));
  const status = myStatus(item), result = state.results.find((entry) => entry.matchId === item.id);
  const canApply = d.canRequestMatch(state, item, me.id);
  const canRecord = item.status === 'open' && !result && old.participants(item).includes(me.id);
  const canWithdraw = item.status === 'open' && !result && ['pending', 'accepted'].includes(status);
  const canRate = result?.attendedIds.includes(me.id);
  const rated = state.ratings.filter((rating) => rating.matchId === item.id && rating.fromId === me.id).map((rating) => rating.toId);
  const pending = item.applications.filter((a) => a.status === 'pending').length;
  const applicantRows = item.hostId === me.id && item.applications.length ? `<div class="block"><h3 class="sub">${ic('userplus')}신청 ${pending ? `<b>${pending}</b>` : ''}</h3><div class="rows">${item.applications.map((application) => { const together = d.playedTogether(state, me.id, application.userId); return `<div class="row static ${pulseId === `${item.id}:${application.userId}` ? 'pulse' : ''}"><button class="row__person" data-action="view-profile" data-id="${esc(application.userId)}">${avatar(application.userId)}<span class="row__body"><strong>${esc(name(application.userId))}</strong><span class="meta">${ic('target')}${esc(user(application.userId).sports[item.sport].level)} ${ic('star')}${d.mannerFor(state, application.userId).toFixed(1)}${together ? ` ${ic('users')}${together}` : ''}</span></span></button><span class="row__end">${application.status === 'pending' && item.status === 'open' && !result ? `<button ${d.recruitmentClosed(item) ? 'disabled' : ''} class="icon-btn solid ok" data-action="decide" data-id="${esc(item.id)}" data-user="${esc(application.userId)}" data-decision="accepted" aria-label="${esc(name(application.userId))} 수락">${ic('check')}</button><button class="icon-btn" data-action="decide" data-id="${esc(item.id)}" data-user="${esc(application.userId)}" data-decision="rejected" aria-label="${esc(name(application.userId))} 거절">${ic('x')}</button>` : application.closedReason ? pill('mute', 'lock', '종료') : application.status === 'accepted' ? pill('done', 'check', '확정') : pill('bad', 'x', '거절')}</span></div>`; }).join('')}</div></div>` : '';
  const ratingBlock = canRate ? `<div class="block"><h3 class="sub">${ic('star')}매너</h3><div class="rows">${result.attendedIds.filter((id) => id !== me.id).map((id) => `<div class="row static">${avatar(id)}<span class="row__body"><strong>${esc(name(id))}</strong></span><span class="row__end">${rated.includes(id) ? pill('done', 'check', '완료') : `<form class="rate-form stars" data-match="${esc(item.id)}" data-target="${esc(id)}">${[1, 2, 3, 4, 5].map((value) => `<button type="submit" name="value" value="${value}" aria-label="${value}점">${ic('star')}</button>`).join('')}</form>`}</span></div>`).join('')}</div></div>` : '';
  const resultBlock = result ? `<div class="result-box">${ic('check')}<strong>${esc(resultSummary(result, item, me.id))}</strong>${result.attendedIds.length < old.participants(item).length ? `<small>${ic('users')}${result.attendedIds.length}/${old.participants(item).length}</small>` : ''}</div><ul class="breakdown">${old.participants(item).map((id) => { let detail = '불참'; if (result.attendedIds.includes(id)) { if (item.sport === 'tennis') { const team = result.noContest ? -1 : result.teams.findIndex((members) => members.includes(id)); detail = result.noContest ? '미성립' : `${team === 0 ? 'A' : 'B'} · ${team === result.winnerTeam ? '승' : '패'}`; } else if (item.sport === 'futsal') detail = `${result.positions?.[id] || '—'}${result.mvpUserId === id ? ' · MVP' : ''}`; else { const entry = result.entries[id]; detail = `${entry.distanceKm}km · ${paceText(entry.paceSec)}`; } } return `<li class="${result.attendedIds.includes(id) ? '' : 'absent'}">${avatar(id, 'xs')}<span>${esc(name(id))}</span><b>${esc(detail)}</b>${item.sport === 'running' && result.reviews?.[id] ? `<small>“${esc(result.reviews[id])}”</small>` : ''}</li>`; }).join('')}</ul>` : '';
  const actions = [canApply ? `<button class="btn primary wide" data-action="apply" data-id="${esc(item.id)}">${ic('send')}참여 신청</button>` : '', canRecord ? `<button class="btn primary wide" data-action="result" data-id="${esc(item.id)}">${ic('check')}결과 기록</button>` : '', canWithdraw ? `<button class="btn ghost" data-action="withdraw" data-id="${esc(item.id)}" aria-label="신청·참가 철회">${ic('undo')}철회</button>` : '', item.hostId === me.id && item.status === 'open' && !result ? `<button class="btn ghost danger" data-action="cancel-match" data-id="${esc(item.id)}" aria-label="자리 취소">${ic('trash')}취소</button>` : ''].filter(Boolean).join('');
  const body = `<div class="detail-top ${item.sport}">${sportIcon(item.sport, 'lg')}<span class="detail-top__kind">${old.SPORT_LABEL[item.sport]} · ${d.FORMAT_LABEL[item.format]}</span>${badge(item)}</div>${fitChips(item)}<div class="info"><span>${ic('calendar')}${dateText(item.date)} ${esc(item.startTime)}–${esc(item.endTime)}</span><span>${ic('pin')}${esc(item.venue)} · ${esc(item.region)}</span><span>${ic('target')}${esc(item.level)} ${seatDots(item)}</span>${item.visibility !== 'public' ? `<span>${ic(item.visibility === 'group' ? 'flag' : 'users')}${item.groupId ? esc(group(item.groupId)?.name) : d.VISIBILITY_LABEL[item.visibility]}</span>` : ''}</div><button class="host" data-action="view-profile" data-id="${esc(item.hostId)}">${avatar(item.hostId)}<span class="host__who"><strong>${esc(name(item.hostId))}</strong><small>${ic('star')}${d.mannerFor(state, item.hostId).toFixed(1)}</small></span>${pill('mine', 'flag', '모집')}${ic('right', 'chev')}</button>${item.description ? `<p class="desc">${esc(item.description)}</p>` : ''}<div class="block"><h3 class="sub">${ic('users')}참가 <b>${old.participants(item).length}/${item.capacity}</b></h3><div class="people compact">${old.participants(item).map((id) => `<button class="person" data-action="view-profile" data-id="${esc(id)}">${avatar(id)}<strong>${esc(name(id))}</strong></button>`).join('')}</div></div>${applicantRows}${resultBlock}${ratingBlock}${actions ? `<div class="sheet__actions">${actions}</div>` : ''}`;
  return sheet(item.title, body, { wide: true, tone: item.sport });
}

function resultModal(item) {
  const people = old.participants(item);
  const attendance = `<fieldset class="pick"><legend>${ic('users')}참석</legend>${people.map((id) => `<label class="pick-chip person-chip"><input type="checkbox" name="attended" value="${esc(id)}" checked>${avatar(id, 'xs')}${esc(name(id))}</label>`).join('')}</fieldset>`;
  const score = (left, right, leftLabel, rightLabel, a, b) => `<div class="score"><label><span>${leftLabel}</span><input type="number" name="${left}" min="0" max="99" value="${a}" inputmode="numeric"></label><b>:</b><label><span>${rightLabel}</span><input type="number" name="${right}" min="0" max="99" value="${b}" inputmode="numeric"></label></div>`;
  let fields = '';
  if (item.sport === 'tennis') fields = `<fieldset class="teams"><legend>팀</legend>${people.map((id, index) => `<div class="team-row">${avatar(id, 'xs')}<span>${esc(name(id))}</span><span class="seg mini ab">${['A', 'B'].map((team) => `<label><input type="radio" name="team-${esc(id)}" value="${team}" ${(index < (item.format === 'doubles' ? 2 : 1)) === (team === 'A') ? 'checked' : ''}>${team}</label>`).join('')}</span></div>`).join('')}</fieldset>${score('scoreA', 'scoreB', 'A', 'B', 6, 4)}<label class="toggle-chip"><input type="checkbox" name="noContest">${ic('x')}<span>경기 미성립</span></label>`;
  else if (item.sport === 'futsal') fields = `${score('scoreFor', 'scoreAgainst', '우리', '상대', 2, 1)}<fieldset class="pick"><legend>${ic('star')}MVP</legend>${people.map((id, index) => `<label class="pick-chip person-chip"><input type="radio" name="mvpUserId" value="${esc(id)}" ${index === 0 ? 'checked' : ''}>${avatar(id, 'xs')}${esc(name(id))}</label>`).join('')}</fieldset><div class="entries">${people.map((id) => `<label class="entry">${avatar(id, 'xs')}<span>${esc(name(id))}</span><input name="position-${esc(id)}" value="${esc(user(id).sports.futsal.preference)}" maxlength="30" aria-label="${esc(name(id))} 포지션" placeholder="포지션"></label>`).join('')}</div>`;
  else fields = `<div class="entries">${people.map((id) => `<div class="entry run">${avatar(id, 'xs')}<span>${esc(name(id))}</span><label><input type="number" min="0.1" max="200" step="0.1" name="distance-${esc(id)}" value="5.0" aria-label="${esc(name(id))} 거리"><i>km</i></label><label><input type="text" inputmode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]" name="pace-${esc(id)}" value="05:40" aria-label="${esc(name(id))} 페이스"><i>/km</i></label><input class="review" name="review-${esc(id)}" maxlength="160" placeholder="한 줄 후기" aria-label="${esc(name(id))} 후기"></div>`).join('')}</div>`;
  const body = `<form id="result-form" class="form" data-id="${esc(item.id)}">${attendance}${fields}<div class="sheet__actions"><button class="btn primary wide" type="submit">${ic('check')}기록</button></div></form>`;
  return sheet(`${old.SPORT_LABEL[item.sport]} 결과`, body, { wide: true, icon: sportIcon(item.sport, 'xs'), tone: item.sport });
}

function profileModal(id, me) {
  const person = user(id); if (!person) return '';
  const friendship = d.friendsOf(state, me.id).includes(id);
  const hasPending = state.friendRequests.some((request) => [request.fromId, request.toId].includes(id) && [request.fromId, request.toId].includes(me.id) && request.status === 'pending');
  const actions = [id !== me.id && !friendship && !hasPending ? `<button class="btn primary wide" data-action="friend-direct" data-id="${esc(id)}">${ic('userplus')}친구 신청</button>` : '', friendship ? `<button class="btn primary wide" data-action="invite" data-id="${esc(id)}">${ic('send')}운동 초대</button>` : '', hasPending ? pill('wait', 'clock', '신청 대기') : ''].filter(Boolean).join('');
  return sheet(person.name, `${renderPassportCard(state,person,deriveKongProfile(state,id,koreaToday()),{flipped:Boolean(modal?.passportFlipped),reducedMotion:reduceMotion(),own:false})}<button type="button" class="btn soft wide" data-action="recent-records" data-user="${esc(id)}">${ic('clock')}운동 기록 보기</button>${actions ? `<div class="sheet__actions">${actions}</div>` : ''}`, { wide: true });
}
function inviteModal(targetId, me) {
  const available = state.matches.filter((item) => item.hostId === me.id && item.status === 'open' && !isDone(item) && !d.recruitmentClosed(item) && old.openSeats(item) && d.canViewMatch(state, item, targetId) && !item.applications.some((a) => a.userId === targetId) && !state.invitations.some((invite) => invite.toId === targetId && invite.matchId === item.id && invite.status === 'pending'));
  const body = available.length ? `<form id="invite-form" class="form" data-target="${esc(targetId)}"><div class="rows">${available.map((item, index) => `<label class="row pick-row">${sportIcon(item.sport)}<span class="row__body"><strong>${esc(item.title)}</strong><span class="meta">${ic('calendar')}${shortDate(item.date)} ${esc(item.startTime)}</span></span><input type="radio" name="matchId" value="${esc(item.id)}" ${index === 0 ? 'checked' : ''}></label>`).join('')}</div><div class="sheet__actions"><button class="btn primary wide" type="submit">${ic('send')}초대</button></div></form>` : `${emptyState('calendar', '초대할 내 자리가 없어요')}<div class="sheet__actions"><button class="btn primary wide" data-action="create">${ic('plus')}자리 만들기</button></div>`;
  return sheet(`${name(targetId)} 초대`, body);
}
function cardModal() {
  const body = `<img class="card-preview" src="${esc(cardUrl)}" alt="DWNC ${modal.kind === 'today' ? '오늘 운동' : '프로필'} 카드"><div class="sheet__actions"><a class="btn primary wide" href="${esc(cardUrl)}" download="dwnc-${modal.kind}-${today()}.png">${ic('download')}저장</a></div>`;
  return sheet(modal.kind === 'today' ? '오늘 카드' : '프로필 카드', body, { wide: true });
}
function cardLoadingModal() { return sheet('카드 만드는 중', '<div class="loading" role="status"><span class="spinner"></span></div>'); }
function cancelConfirmModal(item) {
  return sheet('자리 취소', `<div class="confirm">${ic('alert')}<p><strong>${esc(item.title)}</strong></p></div><div class="sheet__actions"><button class="btn ghost" data-action="close">유지</button><button class="btn danger wide" data-action="confirm-cancel" data-id="${esc(item.id)}">${ic('trash')}취소 확정</button></div>`);
}


function render() {
  cancelKongReaction();
  if (loading) { root.innerHTML = '<main class="recovery" role="status">운동 기록을 불러오는 중…</main>'; return; }
  if (loadError) {
    document.body.classList.remove('dialog-open');
    root.innerHTML = `<main class="recovery">${ic('alert')}<h1>기록을 불러오지 못했어요</h1><p>${esc(loadError)}</p><button class="btn primary" data-action="reload-state">${ic('refresh')}다시 시도</button></main>`;
    return;
  }
  if (!state) { cancelKongReaction(true); document.body.classList.remove('dialog-open'); root.innerHTML = authPage(); document.title = 'DWNC · 로그인'; return; }
  const me = user(state.activeUserId);
  const page = route();
  if (kongRewardUserId && kongRewardUserId !== me.id) kongRewardUserId = null;
  // A highlight survives the follow-up route render, then expires.
  if (pulseId && pulseId !== pulseFor) { pulseFor = pulseId; pulseUntil = performance.now() + 700; }
  if (pulseId && performance.now() >= pulseUntil) { pulseId = null; pulseFor = null; }
  const pageViews = { home: homePage, matches: matchesPage, community: communityPage, ranking: rankingPage, notifications: notificationsPage };
  const unread = state.notifications.filter((item) => item.userId === me.id && !item.read).length;
  const modalContent = modal ? modal.type === 'create' ? createModal(me, modal.groupId) : modal.type === 'details' ? detailModal(match(modal.id), me) : modal.type === 'result' ? resultModal(match(modal.id)) : modal.type === 'profile' ? profileModal(modal.id, me) : modal.type === 'records' ? recordsModal(modal.id || me.id, me) : modal.type === 'invite' ? inviteModal(modal.id, me) : modal.type === 'group-create' ? groupCreateModal(me) : modal.type === 'group-detail' ? groupDetailModal(group(modal.id), me) : modal.type === 'cancel-confirm' ? cancelConfirmModal(match(modal.id)) : modal.type === 'card-loading' ? cardLoadingModal() : cardModal() : '';
  const entering = page !== lastPage; lastPage = page;
  const modalKey = modal ? `${modal.type}:${modal.id || modal.kind || ''}` : null;
  const modalEnter = modalKey && modalKey !== lastModalKey; lastModalKey = modalKey;
  const switcher = `<a href="#/home" class="who">${avatar(me.id, 'sm')}<span class="who__name">${esc(me.name)}</span></a><button class="icon-btn" data-action="reload-state" aria-label="새로고침">${ic('refresh')}</button>`;
  root.innerHTML = `<div class="shell"><div class="main"><header class="top"><a href="#/home" class="brand">DWNC<span>✳</span></a><span class="top__spacer"></span><a href="#/notifications" class="icon-btn bell ${unread ? 'has' : ''}" aria-label="알림 ${unread}개">${ic('bell')}${unread ? `<b class="dot-count">${unread}</b>` : ''}</a>${switcher}</header><main class="content ${entering ? 'enter' : ''}" data-page="${page}">${pageViews[page](me)}</main></div></div><nav class="tabbar ${entering ? 'moved' : ''}" aria-label="하단 메뉴">${navLink('home', '홈', 'home')}${navLink('matches', '매칭', 'calendar')}${navLink('ranking', '랭킹', 'trophy')}${navLink('community', '커뮤니티', 'users')}</nav>${modalContent ? `<div class="backdrop ${modalEnter ? 'enter' : ''}" data-action="close"><div class="sheet-wrap">${modalContent}</div></div>` : ''}`;
  restoreDrafts();
  document.body.classList.toggle('dialog-open', Boolean(modalContent));
  root.querySelector('.shell').inert = Boolean(modalContent);
  root.querySelector('.tabbar').inert = Boolean(modalContent);
  if (modalContent) root.querySelector('[role="dialog"]')?.focus({ preventScroll: true });
  if (pulseId) root.querySelectorAll(`[data-id="${CSS.escape(pulseId)}"]`).forEach((node) => node.classList.add('pulse'));
  if (flash) { const { text, error, icon } = flash; flash = null; showToast(text, error, icon); }
  if (page === 'home' && location.hash === '#/home' && homeCardFlipped && kongRewardUserId === me.id && !modalContent) { kongRewardUserId = null; animateKong(); }
  listAnimate = false;
  document.title = `DWNC · ${pageTitle[page]}`;
}


function setCreateControls() {
  const sport = root.querySelector('#create-form [name="sport"]:checked')?.value;
  const format = root.querySelector('#create-format');
  const capacity = root.querySelector('#create-capacity');
  if (!format || !capacity) return;
  const items = sport === 'tennis' ? [['singles', '단식'], ['doubles', '복식']] : sport === 'futsal' ? [['team', '팀 경기']] : [['crew', '러닝 크루']];
  format.innerHTML = items.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  capacity.value = sport === 'tennis' ? 2 : sport === 'futsal' ? 6 : 5;
  capacity.readOnly = sport === 'tennis';
}
function setCreateVisibility() {
  const value = root.querySelector('#create-visibility')?.value;
  const label = root.querySelector('#group-select-label');
  if (label) label.hidden = value !== 'group';
}
function applyFilters(form, keepFocus = false) {
  const data = new FormData(form);
  filters = { ...emptyFilters(), ...Object.fromEntries(data), openOnly: data.has('openOnly') };
  listAnimate = true; render();
  if (keepFocus) { const input = root.querySelector('#filter-query'); if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); } }
}
async function makePhoto(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) throw new old.DomainError('PNG, JPEG 또는 WebP 사진을 5MB 이하로 선택해 주세요.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 180;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지를 처리할 수 없습니다.');
    const side = Math.min(bitmap.width, bitmap.height), x = (bitmap.width - side) / 2, y = (bitmap.height - side) / 2;
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, 180, 180);
    const url = canvas.toDataURL('image/jpeg', .78);
    if (url.length > 200000) throw new old.DomainError('축소한 사진이 너무 큽니다. 다른 사진을 선택해 주세요.');
    return url;
  } finally { bitmap.close(); }
}

root.addEventListener('click', async (event) => {
  if (pending) return;
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, user: userId, decision, kind } = button.dataset;
  if (action === 'close' && button.classList.contains('backdrop') && event.target !== button) return;
  if (action !== 'export-card') cardRequestId++;
  let exportRequestId = null;
  try {
    if (action === 'close') closeModal();
    else if (action === 'community-tab') { communityTab = id === 'groups' ? 'groups' : 'friends'; render(); }
    else if (action === 'flip-passport') {
      const card = button.closest('.passport-card')?.querySelector('.passport-flip');
      if (!card) return;
      const flipped = card.dataset.flipped !== 'true';
      card.dataset.flipped = String(flipped);
      for (const face of card.querySelectorAll('.passport-face')) { const hidden = face.classList.contains('passport-front') ? flipped : !flipped; face.inert = hidden; face.setAttribute('aria-hidden',String(hidden)); }
      button.setAttribute('aria-pressed',String(flipped)); button.textContent = flipped ? '신분증 보기' : '콩 키우기 보기';
      if (card.closest('.content')) homeCardFlipped = flipped; else if (modal?.type === 'profile') modal.passportFlipped = flipped;
      if (!flipped) cancelKongReaction(true);
      const mascot = card.querySelector('.kong-mascot');
      if (mascot?.dataset.kongMotion === 'react') {
        const person = user(button.dataset.user), derived = deriveKongProfile(state,person.id,koreaToday());
        mascot.querySelector('.kong-art').innerHTML = renderKongCharacter(person,derived,{reducedMotion:reduceMotion()});
        mascot.dataset.kongMotion = derived.total && !reduceMotion() ? 'idle' : 'static';
      }
    }
    else if (action === 'recent-records') openModal({type:'records',id:userId || state.activeUserId},button);
    else if (action === 'kong-react') animateKong();
    else if (action === 'reload-state') { loadError = null; await loadState(); }
    else if (action === 'auth-mode') { authMode = id; render(); }
    else if (action === 'logout') {
      cancelKongReaction(true);
      pending = true; root.inert = true;
      try { await api.request('/api/auth/sign-out',{}); state = null; modal = null; modalStack.length = 0; drafts.clear(); profileEditOpen = false; homeCardFlipped = false; lastPage = null; authMode = 'login'; render(); }
      finally { pending = false; root.inert = false; }
    }
    else if (action === 'create') { openModal({ type: 'create' }, button); setCreateControls(); restoreDrafts(); setCreateVisibility(); }
    else if (action === 'create-group-match') { openModal({ type: 'create', groupId: id }, button); setCreateControls(); restoreDrafts(); setCreateVisibility(); }
    else if (action === 'create-group') { openModal({ type: 'group-create' }, button); }
    else if (action === 'group-detail') { openModal({ type: 'group-detail', id }, button); }
    else if (action === 'join-group') { modal = null; pulseId = id; await save('group.join', {groupId:id}, '그룹 가입', 'flag'); }
    else if (action === 'details') { if (modal?.type === 'result') closeModal(); else openModal({ type: 'details', id }, button); }
    else if (action === 'result') { openModal({ type: 'result', id }, button); }
    else if (action === 'view-profile') { openModal({ type: 'profile', id }, button); }
    else if (action === 'invite') { openModal({ type: 'invite', id }, button); }
    else if (action === 'apply') { modal = null; pulseId = id; await save('match.apply', {matchId:id}, '신청 완료', 'send'); }
    else if (action === 'decide') { modal = { type: 'details', id }; pulseId = `${id}:${userId}`; await save('match.decide', {matchId:id,applicantId:userId,decision}, decision === 'accepted' ? '수락 완료' : '거절함', decision === 'accepted' ? 'check' : 'x'); }
    else if (action === 'withdraw') { modal = null; pulseId = id; await save('match.withdraw', {matchId:id}, '철회함', 'undo'); }
    else if (action === 'cancel-match') { openModal({ type: 'cancel-confirm', id }, button); }
    else if (action === 'confirm-cancel') { modal = null; pulseId = id; await save('match.cancel', {matchId:id}, '자리 취소됨', 'trash'); }
    else if (action === 'friend-decide') await save('friend.decide', {requestId:id,decision}, decision === 'accepted' ? '친구가 됐어요' : '거절함', decision === 'accepted' ? 'users' : 'x');
    else if (action === 'friend-direct') { const target = user(id); modal = null; await save('friend.request', {code:target.friendCode}, '친구 신청 보냄', 'userplus'); }
    else if (action === 'invite-decide') await save('invitation.decide', {invitationId:id,decision}, decision === 'accepted' ? '일정에 추가됨' : '거절함', decision === 'accepted' ? 'calendar' : 'x');
    else if (action === 'filter-sport') { const form = root.querySelector('#filter-form'); form.querySelector('[name="sport"]').value = id; if (filters.sport !== id) form.querySelector('[name="format"]').value = ''; applyFilters(form); }
    else if (action === 'toggle-filters') { advancedFiltersOpen = !advancedFiltersOpen; render(); }
    else if (action === 'reset-filters') { advancedFiltersOpen = false; filters = emptyFilters(); listAnimate = true; render(); }
    else if (action === 'rank-sport') { rankFilter = { ...rankFilter, sport: id }; listAnimate = true; render(); }
    else if (action === 'rank-period') { rankFilter = { ...rankFilter, period: id, month: today().slice(0, 7) }; listAnimate = true; render(); }
    else if (action === 'toggle-edit') { profileEditOpen = !profileEditOpen; render(); if (profileEditOpen) root.querySelector('.edit-panel')?.scrollIntoView({ behavior: reduceMotion() ? 'instant' : 'smooth', block: 'start' }); }
    else if (action === 'copy-code') { try { await navigator.clipboard.writeText(id); showToast('코드 복사됨', false, 'copy'); } catch { showToast(id, false, 'copy'); } }
    else if (action === 'remove-photo') await save('profile.photo', {photo:null}, '사진 삭제', 'trash');
    else if (action === 'read-all') await save('notice.readAll', {}, '모두 읽음', 'checks');
    else if (action === 'open-notice') { const notice = state.notifications.find((item) => item.id === id && item.userId === state.activeUserId); if (!notice) throw new old.DomainError('알림을 찾을 수 없습니다.'); await save('notice.read', {noticeId:id}, null); location.hash = notice.route; routeModal(); render(); }
    else if (action === 'export-card') {
      const requestId = ++cardRequestId, sourceState = state, sourceUserId = state.activeUserId, sourceRoute = location.hash;
      exportRequestId = requestId;
      openModal({ type: 'card-loading', kind }, button);
      const cardState = structuredClone(sourceState);
      if (kind === 'today') { const draft = drafts.get(`${sourceUserId}:note-form::${today()}`); const note = draft?.find(item => item.name === 'note')?.value; if (note !== undefined) { cardState.dailyNotes[sourceUserId] ||= {}; cardState.dailyNotes[sourceUserId][today()] = note; } }
      const url = await (await import('./cards.js')).makeCard(cardState, sourceState.users.find((person) => person.id === sourceUserId), kind);
      if (requestId !== cardRequestId || state !== sourceState || state.activeUserId !== sourceUserId || location.hash !== sourceRoute || modal?.type !== 'card-loading') return;
      cardUrl = url; modal = { type: 'card', kind }; render();
    }
  } catch (error) { if (exportRequestId !== null && exportRequestId !== cardRequestId) return; if (action === 'export-card' && modal?.type === 'card-loading') { modal = null; render(); } feedback(error.message || '작업을 완료하지 못했습니다.'); }
});

let queryTimer = null;
root.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'filter-query') { clearTimeout(queryTimer); queryTimer = setTimeout(() => { const form = root.querySelector('#filter-form'); if (form) applyFilters(form, true); }, 280); }
});
root.addEventListener('change', async (event) => {
  const target = event.target;
  cardRequestId++;
  try {
    if (target.form?.id === 'filter-form' && target.id !== 'filter-query') { applyFilters(target.form); return; }
    if (target.form?.id === 'ranking-form') { const data = Object.fromEntries(new FormData(target.form)); rankFilter = { ...rankFilter, region: data.region, venue: target.name === 'region' ? '' : data.venue }; listAnimate = true; render(); return; }
    if (target.name === 'chosenSports') syncProfileSports();
    if (target.name === 'sport' && target.form?.id === 'create-form') setCreateControls();
    if (target.id === 'create-format') { const capacity = root.querySelector('#create-capacity'); if (capacity) capacity.value = target.value === 'doubles' ? 4 : 2; }
    if (target.id === 'create-visibility') setCreateVisibility();
    if (target.id === 'profile-photo' && target.files?.[0]) { const ownerId = state.activeUserId; const url = await makePhoto(target.files[0]); if (state.activeUserId !== ownerId) return; await save('profile.photo', {photo:url}, '사진 저장', 'camera'); }
  } catch (error) { feedback(error.message || '변경을 완료하지 못했습니다.'); }
});

root.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending) return;
  const form = event.target, formData = new FormData(form, event.submitter), values = Object.fromEntries(formData);
  submittedForm = form;
  try {
    if (form.id === 'auth-form') {
      const signup = authMode === 'signup';
      if (signup && values.password !== values.confirmPassword) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      if (signup && !formData.getAll('chosenSports').length) throw new Error('즐기는 종목을 하나 이상 선택해 주세요.');
      pending = true; root.inert = true; root.setAttribute('aria-busy','true');
      try {
        await api.request(signup ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {email:values.email.trim(),password:values.password,...(signup ? {name:values.name.trim()} : {})});
        // Password fields are discarded immediately after authentication.
        form.reset(); submittedForm = null;
        await loadState();
      } finally { pending = false; root.inert = false; root.removeAttribute('aria-busy'); }
      if (signup && state) {
        const me = user(state.activeUserId);
        await save('profile.update',{name:me.name,region:values.region,ageRange:values.ageRange,gender:me.gender,bio:me.bio,avatar:me.avatar,chosenSports:formData.getAll('chosenSports'),sports:me.sports},'가입 완료');
      }
      if (state) { location.hash = '#/home'; showToast(signup ? '가입 완료 · 환영합니다' : '로그인 완료'); }
      return;
    }
    if (form.id === 'filter-form') { applyFilters(form); return; }
    if (form.id === 'ranking-form') return;
    if (form.id === 'note-form') { await save('note.save', {date:today(),text:values.note}, '한 줄 저장', 'edit'); return; }
    if (form.id === 'friend-form') { await save('friend.request', {code:values.code}, '친구 신청 보냄', 'userplus'); return; }
    if (form.id === 'group-form') { modal = null; await save('group.create', values, '그룹 생성', 'flag'); return; }
    if (form.id === 'create-form') { modal = null; await save('match.create', values, '자리 등록', 'plus'); location.hash = '#/matches'; return; }
    if (form.id === 'profile-form') {
      const sports = Object.fromEntries(formData.getAll('chosenSports').map((sport) => [sport, { experience: values[`${sport}-experience`], level: values[`${sport}-level`], preference: values[`${sport}-preference`], ...(sport === 'tennis' ? { ntrp: values['tennis-ntrp'] } : {}) }]));
      const payload = {name:values.name,region:values.region,ageRange:values.ageRange,gender:values.gender,bio:values.bio,avatar:values.avatar,chosenSports:formData.getAll('chosenSports'),sports}; await save('profile.update', payload, '프로필 저장', 'check'); profileEditOpen = false; render(); return;
    }
    if (form.id === 'invite-form') { modal = null; await save('invitation.send', {matchId:values.matchId,targetId:form.dataset.target}, '초대 보냄', 'send'); return; }
    if (form.id === 'result-form') {
      const item = match(form.dataset.id), attendedIds = formData.getAll('attended');
      let payload = { attendedIds };
      if (item.sport === 'tennis') payload = { ...payload, noContest: formData.has('noContest'), teamAIds: old.participants(item).filter((id) => values[`team-${id}`] === 'A'), scoreA: values.scoreA, scoreB: values.scoreB };
      else if (item.sport === 'futsal') payload = { ...payload, scoreFor: values.scoreFor, scoreAgainst: values.scoreAgainst, mvpUserId: values.mvpUserId, positions: Object.fromEntries(old.participants(item).map((id) => [id, values[`position-${id}`]])) };
      else payload = { ...payload, entries: Object.fromEntries(attendedIds.map((id) => { const [minute, second] = String(values[`pace-${id}`] || '').split(':').map(Number); return [id, { distanceKm: values[`distance-${id}`], paceSec: minute * 60 + second }]; })), reviews: Object.fromEntries(attendedIds.map((id) => [id, values[`review-${id}`]])) };
      modal = null; modalStack.length = 0;
      const previousTotal = deriveKongProfile(state,state.activeUserId,koreaToday()).total; pulseId = item.id; const saved = await save('result.save', {matchId:item.id,data:payload}, '운동 기록 저장 · 콩이 자랐어요', 'check');
      if (saved && deriveKongProfile(state,state.activeUserId,koreaToday()).total > previousTotal && location.hash !== '#/home') location.hash = '#/home';

      return;
    }
    if (form.classList.contains('rate-form')) { modal = { type: 'details', id: form.dataset.match }; await save('rating.save', {matchId:form.dataset.match,targetId:form.dataset.target,value:values.value}, `매너 ${values.value}점`, 'star'); }
  } catch (error) { feedback(error.message || '입력을 확인해 주세요.'); } finally { submittedForm = null; }
});

window.addEventListener('hashchange', () => { cardRequestId++; communityTab = location.hash.startsWith('#/groups') || new URLSearchParams(location.hash.split('?')[1] || '').get('tab') === 'groups' ? 'groups' : 'friends'; homeCardFlipped = new URLSearchParams(location.hash.split('?')[1] || '').get('face') === 'kong' || Boolean(kongRewardUserId); routeModal(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { cancelKongReaction(true); render(); });
window.addEventListener('pagehide', () => cancelKongReaction(true));
window.addEventListener('keydown', (event) => {
  if (!modal) return;
  if (event.key === 'Escape') { closeModal(); return; }
  if (event.key !== 'Tab') return;
  const dialog = root.querySelector('[role="dialog"]');
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((element) => element.offsetParent !== null && !element.closest('[inert]'));
  if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  else if (document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
});
communityTab = location.hash.startsWith('#/groups') || new URLSearchParams(location.hash.split('?')[1] || '').get('tab') === 'groups' ? 'groups' : 'friends'; homeCardFlipped = new URLSearchParams(location.hash.split('?')[1] || '').get('face') === 'kong';
routeModal();
render();
await loadState();
