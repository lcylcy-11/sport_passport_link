import * as old from './domain.js';
import * as d from './extended-domain.js';
import { ic, installIcons } from './icons.js';

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
const pages = ['home', 'matches', 'activity', 'people', 'groups', 'profile', 'ranking', 'notifications'];
const pageTitle = { home: '홈', matches: '매칭', activity: '내 운동', people: '친구', groups: '그룹', profile: '프로필', ranking: '랭킹', notifications: '알림' };
let state, storageMode = 'saved', corrupt = false, conflict = false, savedRaw = null, modal = null, flash = null, cardUrl = null, cardRequestId = 0;
const emptyFilters = () => ({ sport: '', format: '', region: '', venue: '', date: '', time: '', level: '', query: '', openOnly: true, minOpenSeats: '' });
let filters = emptyFilters();
const drafts = new Map();
const modalStack = [];
let submittedForm = null, returnFocus = null, returnScroll = 0;
let advancedFiltersOpen = false, profileEditOpen = false, listAnimate = false;
let rankFilter = { sport: 'tennis', region: '', venue: '', period: 'month', month: today().slice(0, 7) };
// Motion bookkeeping: what changed since the last render decides which elements animate.
let lastPage = null, lastModalKey = null, pulseId = null, pulseFor = null, pulseUntil = 0, newStampId = null, toastTimer = null, closing = false;

function loadState() {
  let raw;
  try { raw = localStorage.getItem(old.STORAGE_KEY); }
  catch { storageMode = 'memory'; state = d.createExtendedSeed(); return; }
  if (!raw) { state = d.createExtendedSeed(); savedRaw = null; return; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { corrupt = true; return; }
  if (!parsed || typeof parsed !== 'object') { corrupt = true; return; }
  try {
    if (parsed.version === 1) {
      if (!d.strictLegacy(parsed)) { corrupt = true; return; }
      const migrated = d.migrateV1(parsed);
      const json = JSON.stringify(migrated);
      try { localStorage.setItem(old.STORAGE_KEY, json); savedRaw = json; }
      catch { storageMode = 'memory'; savedRaw = raw; }
      state = migrated;
    } else if (d.validateV2(parsed)) { state = d.reconcileRequests(parsed); savedRaw = raw; }
    else corrupt = true;
  } catch { corrupt = true; }
}
loadState();

function save(next, message, icon = 'check') {
  if (conflict) throw new old.DomainError('다른 탭에서 데이터가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
  if (!d.validateV2(next)) throw new old.DomainError('변경된 데모 데이터가 올바르지 않아 저장하지 않았습니다.');
  if (storageMode === 'saved') {
    let current;
    try { current = localStorage.getItem(old.STORAGE_KEY); }
    catch { storageMode = 'memory'; }
    if (storageMode === 'saved' && current !== savedRaw) { conflict = true; modal = null; render(); throw new old.DomainError('다른 탭의 변경을 발견했습니다. 새로고침해 최신 데이터를 확인해 주세요.'); }
    if (storageMode === 'saved') {
      try { const json = JSON.stringify(next); localStorage.setItem(old.STORAGE_KEY, json); savedRaw = json; }
      catch { storageMode = 'memory'; }
    }
  }
  const submittedDraftKey = submittedForm ? draftKey(submittedForm) : null;
  state = next;
  if (submittedDraftKey) drafts.delete(submittedDraftKey);
  if (!modal) modalStack.length = 0;
  flash = !message && storageMode === 'saved' ? null : { text: storageMode === 'saved' ? message : `${message || '저장'} · 현재 탭에서만 유지`, error: storageMode !== 'saved', icon: storageMode === 'saved' ? icon : 'alert' };
  render();
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
  if (!form || !['note-form', 'profile-form', 'create-form', 'result-form', 'group-form', 'onboarding-form'].includes(form.id) || event.target.type === 'file') return;
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

function route() { const name = location.hash.replace(/^#\//, '').split('?')[0]; return pages.includes(name) ? name : 'home'; }
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
function playRing(identity) {
  let start = 0;
  const stops = identity.sports.filter((item) => item.sessions).map((item) => { const end = start + item.share * 360; const stop = `${sportColor[item.sport]} ${start.toFixed(1)}deg ${(end - 2).toFixed(1)}deg, transparent ${(end - 2).toFixed(1)}deg ${end.toFixed(1)}deg`; start = end; return stop; });
  const fill = stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#ffffff22 0deg 360deg)';
  const label = identity.sports.map((item) => `${old.SPORT_LABEL[item.sport]} ${item.sessions}회`).join(', ');
  return `<span class="ring" style="--ring:${fill}" role="img" aria-label="함께한 운동 ${identity.total}회: ${esc(label)}"><span><strong data-count="${identity.total}">${identity.total}</strong><small>운동</small></span></span>`;
}
// The signature view: one person, several sports, each judged by its own metric.
function playCard(personId) {
  const person = user(personId), identity = d.sportIdentity(state, personId);
  if (!person || !identity) return '';
  const tiles = identity.sports.map((item) => { const metric = sportMetric(identity.stats, item.sport); return `<li class="tile ${item.sport}">${ic(item.sport)}<strong>${esc(metric.value)}</strong><small>${metric.label}</small></li>`; }).join('');
  return `<a class="playcard" href="#/profile" aria-label="${esc(person.name)}님의 프로필 열기"><span class="playcard__body">${playRing(identity)}<span class="playcard__who">${avatar(personId, 'md')}<strong>${esc(person.name)}</strong><span class="playcard__meta">${pill('ghost', 'star', d.mannerFor(state, personId).toFixed(1))}${pill('ghost', 'calendar', `이번 달 ${identity.monthTotal}`)}</span></span><span class="playcard__tag">${identity.sports.length}종목</span></span><ul class="tiles">${tiles}</ul></a>`;
}
const sportCode = { tennis: 'TEN', futsal: 'FUT', running: 'RUN' };
const stampTilt = [-7, 5, -3, 8, -5, 3];
const dotDate = (date) => date ? date.replaceAll('-', '.') : '—';
function stampLabel({ match: item, result }, userId) {
  if (item.sport === 'tennis') return result.noContest ? '미성립' : result.teams[result.winnerTeam].includes(userId) ? '승리' : '패배';
  if (item.sport === 'futsal') return `${result.teamOutcome === 'win' ? '승' : result.teamOutcome === 'loss' ? '패' : '무'} ${result.scoreFor}:${result.scoreAgainst}${result.mvpUserId === userId ? ' MVP' : ''}`;
  return `${result.entries[userId]?.distanceKm ?? 0}km`;
}
function stampMark(stamp, userId, index) {
  const item = stamp.match, tilt = stampTilt[index % stampTilt.length];
  if (!d.canViewMatch(state, item, state.activeUserId)) return `<span class="stamp private" style="--tilt:${tilt}deg" title="비공개 기록">${ic('lock')}<em>${dotDate(item.date).slice(5)}</em></span>`;
  const partners = stamp.partners.map(name).join(', ');
  return `<button type="button" class="stamp ${item.sport} ${newStampId === item.id ? 'fresh' : ''}" style="--tilt:${tilt}deg;--i:${index}" data-action="details" data-id="${esc(item.id)}" aria-label="${esc(`${dotDate(item.date)} ${item.venue} ${old.SPORT_LABEL[item.sport]} ${stampLabel(stamp, userId)}${partners ? `, 함께: ${partners}` : ''}`)}">${ic(item.sport)}<strong>${esc(item.venue)}</strong><span>${esc(stampLabel(stamp, userId))}</span><em>${dotDate(item.date).slice(5)}</em></button>`;
}
// Passport-like layout (identity page + stamp page); the product still calls it a profile.
function profileBook(personId, compact = false) {
  const person = user(personId); if (!person) return '';
  const identity = d.sportIdentity(state, personId), book = d.stampsFor(state, personId);
  const together = personId !== state.activeUserId ? d.playedTogether(state, state.activeUserId, personId) : null;
  const photo = person.photo ? `<img src="${esc(person.photo)}" alt="">` : `<span aria-hidden="true">${esc(person.avatar || person.name.slice(-1))}</span>`;
  const sports = identity.sports.map((item) => { const metric = sportMetric(identity.stats, item.sport), detail = person.sports[item.sport]; return `<li class="bsport ${item.sport}">${sportIcon(item.sport)}<span class="bsport__name"><strong>${old.SPORT_LABEL[item.sport]}<em>${esc(detail.level)}</em></strong><small>${esc(detail.experience)} · ${esc(detail.preference)}${item.sport === 'tennis' ? ` · NTRP ${esc(detail.ntrp)}` : ''}</small></span><span class="bsport__metric"><b>${esc(metric.value)}</b><small>${metric.label} · ${esc(metric.sub)}</small></span></li>`; }).join('');
  const mrz = `DWNC<<${person.friendCode.replace(/[^A-Z0-9]/g, '')}<<${person.chosenSports.map((sport) => sportCode[sport]).join('<')}`.padEnd(40, '<').slice(0, 40);
  const shown = compact ? book.stamps.slice(0, 6) : book.stamps;
  const stamps = shown.map((stamp, index) => stampMark(stamp, personId, index)).join('') + (compact && book.stamps.length > shown.length ? `<span class="stamp more">+${book.stamps.length - shown.length}</span>` : compact ? '' : `<span class="stamp next" title="다음 도장">${ic('plus')}</span>`);
  return `<section class="book ${compact ? 'compact' : ''}" aria-label="${esc(person.name)}님의 프로필"><div class="page id"><div class="page__head"><span class="brandmark">DWNC ✳</span><span class="no">No. ${esc(person.friendCode)}</span></div><div class="id__main"><div class="photo">${photo}</div><div class="id__fields"><strong class="id__name">${esc(person.name)}</strong><span>${ic('pin')}${esc(person.region)}</span><span>${ic('user')}${esc(person.ageRange)} · ${esc(person.gender || '미입력')}</span><span>${ic('star')}${d.mannerFor(state, personId).toFixed(1)}${together ? ` <b class="together">${ic('users')}함께 ${together}회</b>` : ''}</span><span title="첫 기록">${ic('calendar')}${dotDate(book.since)}</span></div></div>${person.bio ? `<p class="bio">${esc(person.bio)}</p>` : ''}<ul class="bsports">${sports}</ul><p class="mrz" aria-hidden="true">${esc(mrz)}</p></div><div class="page stamps"><div class="page__head"><span class="brandmark">STAMPS</span><span class="stamp-count" title="도장 · 구장 · 동네">${ic('check')}${book.stamps.length} ${ic('pin')}${book.venues} ${ic('globe')}${book.regions}</span></div>${book.stamps.length || !compact ? `<div class="stamp-grid">${stamps}</div>` : emptyState('sparkle', '아직 도장이 없어요')}</div></section>`;
}
function todaySummary(items) {
  if (!items.length) return '';
  const done = items.filter(({ result }) => result).length;
  return `<span class="today-sum" title="오늘 ${items.length}건 중 ${done}건 완료">${items.map(({ match: item, result }) => `<i class="dot ${item.sport} ${result ? 'on' : ''}"></i>`).join('')}<b>${done}/${items.length}</b></span>`;
}

function homePage(me) {
  const todayItems = d.activityFor(state, me.id);
  const suggestions = d.filterMatches(state, me.id, { openOnly: true, region: me.region }).filter((item) => item.hostId !== me.id && !item.applications.some((a) => a.userId === me.id)).slice(0, 4);
  const note = state.dailyNotes[me.id]?.[today()] || '';
  const todayCards = todayItems.map(({ match: item, result }) => `<button type="button" class="today ${item.sport} ${result ? 'is-done' : ''}" data-action="details" data-id="${esc(item.id)}"><span class="today__time">${esc(item.startTime)}</span>${sportIcon(item.sport)}<span class="today__body"><strong>${esc(item.title)}</strong>${result ? `<span class="today__res">${ic('check')}${esc(resultSummary(result, item, me.id))}</span>` : `<span class="meta">${ic('pin')}${esc(item.venue)}</span>`}</span>${result ? '' : item.status === 'cancelled' ? pill('bad', 'x', '취소') : avatarStack(old.participants(item), 3)}</button>`).join('');
  return `<section class="hero"><h1>오늘도, 같이<br><em>움직여볼까요?</em></h1><div class="hero__actions"><a class="btn primary" href="#/matches">${ic('search')}매칭 찾기</a><button class="btn soft" data-action="create">${ic('plus')}자리 만들기</button></div></section>${playCard(me.id)}<section class="block"><div class="block__head"><h2>오늘 ${todaySummary(todayItems)}</h2><button class="icon-btn" data-action="export-card" data-kind="today" aria-label="오늘 운동 카드 공유" title="오늘 카드">${ic('share')}</button></div><div class="today-list">${todayItems.length ? todayCards : emptyState('calendar', '오늘 일정이 없어요', '<a class="btn soft sm" href="#/matches">' + ic('search') + '찾아보기</a>')}</div><form id="note-form" class="note"><label class="sr" for="daily-note">오늘의 한 줄</label>${ic('edit')}<input id="daily-note" name="note" maxlength="140" value="${esc(note)}" placeholder="오늘의 한 줄"><button class="icon-btn solid" type="submit" aria-label="한 줄 저장">${ic('check')}</button></form></section><section class="block"><div class="block__head"><h2>근처 자리</h2><a href="#/matches" class="more">전체${ic('right')}</a></div><div class="cards">${suggestions.length ? suggestions.map(matchCard).join('') : emptyState('pin', '근처에 열린 자리가 없어요', `<button class="btn soft sm" data-action="create">${ic('plus')}자리 만들기</button>`)}</div></section>`;
}

function sportTabs(action, current, withAll = true) {
  const items = [...(withAll ? [['', '전체', 'grid']] : []), ...old.SPORTS.map((sport) => [sport, old.SPORT_LABEL[sport], sport])];
  return `<div class="seg sports-seg" role="group" aria-label="종목">${items.map(([value, label, icon]) => `<button type="button" class="${value ? `s-${value}` : ''}" data-action="${action}" data-id="${value}" aria-pressed="${current === value}">${ic(icon)}<span>${label}</span></button>`).join('')}</div>`;
}
function matchesPage(me) {
  const available = d.filterMatches(state, me.id, filters);
  const regions = [...new Set(d.visibleMatches(state, me.id).map(item => item.region))].sort();
  const advancedCount = ['format', 'venue', 'date', 'time', 'level', 'minOpenSeats'].filter(key => filters[key]).length;
  return `<div class="head"><h1>매칭</h1><button class="btn primary" data-action="create">${ic('plus')}<span>자리 만들기</span></button></div>${sportTabs('filter-sport', filters.sport)}<form id="filter-form" class="filters" role="search"><input type="hidden" name="sport" value="${esc(filters.sport)}"><label class="search">${ic('search')}<span class="sr">검색</span><input id="filter-query" name="query" value="${esc(filters.query)}" placeholder="장소, 제목" autocomplete="off"></label><div class="filters__row"><label class="chip-select">${ic('pin')}<span class="sr">지역</span><select name="region">${select(regions, filters.region, '전체 지역')}</select></label><label class="toggle-chip"><input type="checkbox" name="openOnly" ${filters.openOnly ? 'checked' : ''}>${ic('check')}<span>신청 가능</span></label><button type="button" class="icon-btn ${advancedFiltersOpen || advancedCount ? 'on' : ''}" data-action="toggle-filters" aria-expanded="${advancedFiltersOpen}" aria-label="상세 필터">${ic('sliders')}${advancedCount ? `<b class="dot-count">${advancedCount}</b>` : ''}</button></div>${advancedFiltersOpen ? `<div class="filters__more"><label>방식<select name="format"><option value="">전체</option>${Object.entries(d.FORMAT_LABEL).map(([value, label]) => `<option value="${value}" ${filters.format === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>날짜<input type="date" name="date" value="${esc(filters.date)}"></label><label>시간<select name="time"><option value="">전체</option>${[['morning', '오전'], ['afternoon', '오후'], ['evening', '저녁']].map(([value, label]) => `<option value="${value}" ${filters.time === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>수준<select name="level">${select(old.LEVELS, filters.level, '전체')}</select></label><label>빈자리<select name="minOpenSeats">${select(['1', '2', '3', '4'], filters.minOpenSeats, '상관없음')}</select></label><label>장소<input name="venue" value="${esc(filters.venue)}" placeholder="구장"></label><button type="button" class="btn ghost sm" data-action="reset-filters">${ic('refresh')}초기화</button></div>` : `<input type="hidden" name="format" value="${esc(filters.format)}"><input type="hidden" name="date" value="${esc(filters.date)}"><input type="hidden" name="time" value="${esc(filters.time)}"><input type="hidden" name="level" value="${esc(filters.level)}"><input type="hidden" name="minOpenSeats" value="${esc(filters.minOpenSeats)}"><input type="hidden" name="venue" value="${esc(filters.venue)}">`}</form><div class="count">${available.length}개</div><div class="cards ${listAnimate ? 'enter' : ''}">${available.length ? available.map(matchCard).join('') : emptyState('search', '조건에 맞는 자리가 없어요', `<button class="btn ghost sm" data-action="reset-filters">${ic('refresh')}초기화</button><button class="btn primary sm" data-action="create">${ic('plus')}만들기</button>`)}</div>`;
}

function activityPage(me) {
  const mine = state.matches.filter((item) => item.hostId === me.id || item.applications.some((a) => a.userId === me.id)).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const live = (item) => item.status === 'open' && !isDone(item) && !d.recruitmentClosed(item);
  const waiting = mine.filter((item) => item.hostId === me.id && live(item)).reduce((sum, item) => sum + item.applications.filter((a) => a.status === 'pending').length, 0);
  const upcoming = mine.filter((item) => live(item) && (item.hostId === me.id || myStatus(item) === 'accepted')).length;
  const stat = (icon, value, label, cls = '') => `<div class="stat ${cls}">${ic(icon)}<strong>${value}</strong><small>${label}</small></div>`;
  const sub = (item) => {
    if (isDone(item)) return `<span class="row__res">${ic('check')}${esc(resultSummary(state.results.find((r) => r.matchId === item.id), item, me.id))}</span>`;
    const pending = item.hostId === me.id ? item.applications.filter((a) => a.status === 'pending').length : 0;
    return pending && live(item) ? pill('wait', 'userplus', `${pending}`) : avatarStack(old.participants(item), 3);
  };
  return `<div class="head"><h1>내 운동</h1><button class="btn primary" data-action="create">${ic('plus')}<span>자리 만들기</span></button></div><div class="stats">${stat('calendar', d.activityFor(state, me.id).length, '오늘')}${stat('clock', upcoming, '예정')}${stat('userplus', waiting, '응답 대기', waiting ? 'hot' : '')}</div><div class="rows">${mine.length ? mine.map((item) => `<button type="button" class="row" data-action="details" data-id="${esc(item.id)}">${sportIcon(item.sport)}<span class="row__body"><strong>${esc(item.title)}</strong><span class="meta">${ic('calendar')}${shortDate(item.date)} ${esc(item.startTime)} ${ic('pin')}${esc(item.venue)}</span></span><span class="row__end">${badge(item)}${sub(item)}</span></button>`).join('') : emptyState('calendar', '아직 참여한 운동이 없어요', `<a class="btn primary sm" href="#/matches">${ic('search')}매칭 찾기</a>`)}</div>`;
}

function profilePage(me) {
  const friends = d.friendsOf(state, me.id).length, groups = state.groups.filter((item) => item.memberIds.includes(me.id)).length;
  const incoming = state.friendRequests.filter((request) => request.toId === me.id && request.status === 'pending').length + state.invitations.filter((invite) => invite.toId === me.id && invite.status === 'pending').length;
  const editor = `<form id="profile-form" class="editor"><div class="photo-row">${avatar(me.id, 'lg')}<label class="btn soft sm">${ic('camera')}사진<input id="profile-photo" class="sr" type="file" accept="image/png,image/jpeg,image/webp"></label>${me.photo ? `<button type="button" class="btn ghost sm" data-action="remove-photo">${ic('trash')}삭제</button>` : ''}</div><div class="grid2"><label>이름<input name="name" required maxlength="24" value="${esc(me.name)}"></label><label>지역<input name="region" required maxlength="30" value="${esc(me.region)}"></label><label>연령대<input name="ageRange" required value="${esc(me.ageRange)}"></label><label>성별<select name="gender">${select(['미입력', '여성', '남성', '기타'], me.gender)}</select></label><label>아이콘<select name="avatar">${select(d.AVATARS, me.avatar)}</select></label></div><fieldset class="pick"><legend>종목</legend>${old.SPORTS.map((sport) => `<label class="pick-chip s-${sport}"><input type="checkbox" name="chosenSports" value="${sport}" ${me.chosenSports.includes(sport) ? 'checked' : ''}>${ic(sport)}${old.SPORT_LABEL[sport]}</label>`).join('')}</fieldset><label>소개<textarea name="bio" maxlength="180" rows="2">${esc(me.bio)}</textarea></label>${old.SPORTS.map((sport) => `<fieldset class="sport-edit s-${sport}" data-sport-editor="${sport}"><legend>${ic(sport)}${old.SPORT_LABEL[sport]}</legend><div class="grid2"><label>경력<input name="${sport}-experience" required value="${esc(me.sports[sport].experience)}"></label><label>수준<select name="${sport}-level">${select(old.LEVELS, me.sports[sport].level)}</select></label><label>${sport === 'tennis' ? '방식' : sport === 'futsal' ? '포지션' : '거리'}<input name="${sport}-preference" required value="${esc(me.sports[sport].preference)}"></label>${sport === 'tennis' ? `<label>NTRP<input type="number" name="tennis-ntrp" min="1" max="7" step="0.5" required value="${esc(me.sports.tennis.ntrp)}"></label>` : ''}</div></fieldset>`).join('')}<div class="sticky-actions"><button class="btn primary wide" type="submit">${ic('check')}저장</button></div></form>`;
  return `<div class="head"><h1>프로필</h1><div class="head__actions"><button class="icon-btn ${profileEditOpen ? 'on' : ''}" data-action="toggle-edit" aria-expanded="${profileEditOpen}" aria-label="프로필 편집" title="편집">${ic('edit')}</button><button class="icon-btn" data-action="export-card" data-kind="profile" aria-label="프로필 카드 공유" title="공유">${ic('share')}</button></div></div>${profileEditOpen ? `<section class="panel edit-panel">${editor}</section>` : ''}${profileBook(me.id)}<div class="links"><a class="link-tile" href="#/people">${ic('users')}<span>친구</span><b>${friends}</b>${incoming ? `<b class="dot-count">${incoming}</b>` : ''}</a><a class="link-tile" href="#/groups">${ic('flag')}<span>그룹</span><b>${groups}</b></a></div><button type="button" class="text-btn" data-action="reset-demo">${ic('refresh')}데모 초기화</button>`;
}

function rankingPage(me) {
  const regions = [...new Set(state.matches.map((item) => item.region))].sort();
  const venues = [...new Set(state.matches.filter((item) => !rankFilter.region || item.region === rankFilter.region).map((item) => item.venue))].sort();
  let rows = d.ranking(state, rankFilter.sport, rankFilter), fallback = false;
  if (!rows.length && rankFilter.period === 'month') { const allRows = d.ranking(state, rankFilter.sport, { ...rankFilter, period: 'all' }); if (allRows.length) { rows = allRows; fallback = true; } }
  const metric = (stats) => rankFilter.sport === 'tennis' ? [`${stats.tennis.winRate}%`, `${stats.tennis.games}경기`] : rankFilter.sport === 'futsal' ? [`MVP ${stats.futsal.mvp}`, `${stats.futsal.games}경기`] : [paceText(stats.running.paceSec), `${stats.running.distanceKm}km`];
  const podium = rows.slice(0, 3), rest = rows.slice(3);
  const order = podium.length === 3 ? [1, 0, 2] : podium.length === 2 ? [1, 0] : [0];
  return `<div class="head"><h1>랭킹</h1></div>${sportTabs('rank-sport', rankFilter.sport, false)}<form id="ranking-form" class="filters"><div class="filters__row"><label class="chip-select">${ic('pin')}<span class="sr">지역</span><select name="region">${select(regions, rankFilter.region, '전체 지역')}</select></label><label class="chip-select">${ic('flag')}<span class="sr">장소</span><select name="venue">${select(venues, rankFilter.venue, '전체 장소')}</select></label><div class="seg mini" role="group" aria-label="기간">${[['month', '이번 달'], ['all', '전체']].map(([value, label]) => `<button type="button" data-action="rank-period" data-id="${value}" aria-pressed="${rankFilter.period === value}">${label}</button>`).join('')}</div></div></form>${fallback ? `<p class="hint">${ic('info')}이번 달 기록이 없어 전체 기간</p>` : ''}${rows.length ? `<div class="podium ${listAnimate ? 'enter' : ''}">${order.map((index) => { const { user: person, stats } = podium[index]; const [value, sub] = metric(stats); return `<button type="button" class="podium__spot p${index + 1} ${person.id === me.id ? 'me' : ''}" data-action="view-profile" data-id="${esc(person.id)}"><span class="medal">${index + 1}</span>${avatar(person.id, 'lg')}<strong>${esc(person.name)}</strong><b>${esc(value)}</b><small>${esc(sub)}</small><span class="podium__bar"></span></button>`; }).join('')}</div>${rest.length ? `<div class="rows">${rest.map(({ user: person, stats }, index) => { const [value, sub] = metric(stats); return `<button type="button" class="row rank ${person.id === me.id ? 'me' : ''}" data-action="view-profile" data-id="${esc(person.id)}"><b class="rank__n">${index + 4}</b>${avatar(person.id)}<span class="row__body"><strong>${esc(person.name)}</strong><span class="meta">${esc(person.region)}</span></span><span class="rank__v"><b>${esc(value)}</b><small>${esc(sub)}</small></span></button>`; }).join('')}</div>` : ''}` : emptyState('trophy', '아직 기록이 없어요')}`;
}

function peoplePage(me) {
  const friends = d.friendsOf(state, me.id);
  const incoming = state.friendRequests.filter((request) => request.toId === me.id && request.status === 'pending');
  const outgoing = state.friendRequests.filter((request) => request.fromId === me.id && request.status === 'pending');
  const invites = state.invitations.filter((invite) => invite.toId === me.id && invite.status === 'pending');
  const personRow = (id, end) => `<div class="row static">${avatar(id)}<span class="row__body"><strong>${esc(name(id))}</strong><span class="meta">${ic('pin')}${esc(user(id).region)} ${ic('star')}${d.mannerFor(state, id).toFixed(1)}</span></span><span class="row__end">${end}</span></div>`;
  const decide = (action, id, yes, no) => `<button class="icon-btn solid ok" data-action="${action}" data-id="${esc(id)}" data-decision="${yes}" aria-label="수락">${ic('check')}</button><button class="icon-btn" data-action="${action}" data-id="${esc(id)}" data-decision="${no}" aria-label="거절">${ic('x')}</button>`;
  return `<div class="head"><h1>친구</h1><button class="btn soft" data-action="onboard">${ic('userplus')}<span>새 인물</span></button></div><div class="code-card"><span class="code-card__label">No.</span><strong>${esc(me.friendCode)}</strong><button class="icon-btn" data-action="copy-code" data-id="${esc(me.friendCode)}" aria-label="친구 코드 복사">${ic('copy')}</button></div><form id="friend-form" class="send-row"><label class="search">${ic('userplus')}<span class="sr">친구 코드</span><input name="code" required placeholder="DWNC-0002" autocomplete="off"></label><button class="icon-btn solid" type="submit" aria-label="친구 신청 보내기">${ic('send')}</button></form>${incoming.length ? `<section class="block"><h2 class="sub">${ic('bell')}받은 신청</h2><div class="rows">${incoming.map((request) => personRow(request.fromId, decide('friend-decide', request.id, 'accepted', 'rejected'))).join('')}</div></section>` : ''}${invites.length ? `<section class="block"><h2 class="sub">${ic('send')}운동 초대</h2><div class="rows">${invites.map((invite) => { const item = match(invite.matchId); return `<div class="row static">${sportIcon(item.sport)}<span class="row__body"><strong>${esc(item.title)}</strong><span class="meta">${ic('calendar')}${shortDate(item.date)} ${ic('user')}${esc(name(invite.fromId))}</span></span><span class="row__end">${decide('invite-decide', invite.id, 'accepted', 'declined')}</span></div>`; }).join('')}</div></section>` : ''}<section class="block"><h2 class="sub">${ic('users')}내 친구 <b>${friends.length}</b>${outgoing.length ? pill('wait', 'clock', `${outgoing.length}`) : ''}</h2>${friends.length ? `<div class="rows">${friends.map((id) => `<button type="button" class="row" data-action="view-profile" data-id="${esc(id)}">${avatar(id)}<span class="row__body"><strong>${esc(name(id))}</strong><span class="meta">${ic('pin')}${esc(user(id).region)} ${ic('star')}${d.mannerFor(state, id).toFixed(1)}</span></span>${ic('right', 'chev')}</button>`).join('')}</div>` : emptyState('users', '코드로 첫 친구를 추가해 보세요')}</section><section class="block"><h2 class="sub">${ic('globe')}둘러보기</h2><div class="people">${state.users.filter((person) => person.id !== me.id).map((person) => `<button class="person" type="button" data-action="view-profile" data-id="${esc(person.id)}">${avatar(person.id, 'lg')}<strong>${esc(person.name)}</strong><span class="person__sports">${person.chosenSports.map((sport) => sportIcon(sport, 'xs')).join('')}</span></button>`).join('')}</div></section>`;
}

function groupsPage(me) {
  return `<div class="head"><h1>그룹</h1><button class="btn primary" data-action="create-group">${ic('plus')}<span>그룹 만들기</span></button></div><div class="cards">${state.groups.length ? state.groups.map((item) => { const member = item.memberIds.includes(me.id); return `<button type="button" class="gcard ${member ? 'member' : ''}" data-action="group-detail" data-id="${esc(item.id)}"><span class="gcard__mark">${ic('flag')}</span><span class="gcard__body"><strong>${esc(item.name)}</strong><span class="meta">${ic('pin')}${esc(item.region)} ${ic('users')}${item.memberIds.length}</span>${item.description ? `<small>${esc(item.description)}</small>` : ''}</span>${avatarStack(item.memberIds, 3)}${member ? ic('right', 'chev') : pill('open', 'plus', '가입')}</button>`; }).join('') : emptyState('flag', '첫 그룹을 만들어 보세요')}</div>`;
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
function onboardingModal() {
  const body = `<form id="onboarding-form" class="form"><div class="grid2"><label>이름<input name="name" required maxlength="24" placeholder="이름"></label><label>${ic('pin')}지역<input name="region" required maxlength="30" placeholder="관악구"></label><label>연령대<input name="ageRange" required placeholder="20대"></label><label>성별<select name="gender">${select(['미입력', '여성', '남성', '기타'], '미입력')}</select></label><label>아이콘<select name="avatar">${select(d.AVATARS, '✳')}</select></label></div><fieldset class="pick"><legend>종목</legend>${old.SPORTS.map((sport) => `<label class="pick-chip s-${sport}"><input type="checkbox" name="chosenSports" value="${sport}" ${sport === 'tennis' ? 'checked' : ''}>${ic(sport)}${old.SPORT_LABEL[sport]}</label>`).join('')}</fieldset><label>소개<textarea name="bio" maxlength="180" rows="2"></textarea></label><div class="sheet__actions"><button type="submit" class="btn primary wide">${ic('check')}만들기</button></div></form>`;
  return sheet('새 데모 인물', body, { wide: true });
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
  const resultBlock = result ? `<div class="result-box">${ic('check')}<strong>${esc(resultSummary(result, item, me.id))}</strong>${result.attendedIds.length < old.participants(item).length ? `<small>${ic('users')}${result.attendedIds.length}/${old.participants(item).length}</small>` : ''}</div><ul class="breakdown">${old.participants(item).map((id) => { let detail = '불참'; if (result.attendedIds.includes(id)) { if (item.sport === 'tennis') { const team = result.teams.findIndex((members) => members.includes(id)); detail = result.noContest ? '미성립' : `${team === 0 ? 'A' : 'B'} · ${team === result.winnerTeam ? '승' : '패'}`; } else if (item.sport === 'futsal') detail = `${result.positions?.[id] || '—'}${result.mvpUserId === id ? ' · MVP' : ''}`; else { const entry = result.entries[id]; detail = `${entry.distanceKm}km · ${paceText(entry.paceSec)}`; } } return `<li class="${result.attendedIds.includes(id) ? '' : 'absent'}">${avatar(id, 'xs')}<span>${esc(name(id))}</span><b>${esc(detail)}</b>${item.sport === 'running' && result.reviews?.[id] ? `<small>“${esc(result.reviews[id])}”</small>` : ''}</li>`; }).join('')}</ul>` : '';
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
  return sheet(person.name, `${profileBook(id, true)}${actions ? `<div class="sheet__actions">${actions}</div>` : ''}`, { wide: true });
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
function resetConfirmModal() {
  return sheet('데모 초기화', `<div class="confirm">${ic('refresh')}<p>${dateText(today())} 기준 예시로 돌아가요. 되돌릴 수 없어요.</p></div><div class="sheet__actions"><button class="btn ghost" data-action="close">유지</button><button class="btn danger wide" data-action="reset-storage">${ic('refresh')}초기화</button></div>`);
}
// A recorded result is stamped into the book: show the stamp landing, then let it go.
function showCelebrate(matchId) {
  const me = user(state.activeUserId), item = match(matchId);
  document.querySelector('.celebrate')?.remove();
  const stamp = d.stampsFor(state, me.id).stamps.find((entry) => entry.match.id === matchId);
  const node = document.createElement('div');
  node.className = 'celebrate'; node.setAttribute('role', 'status'); node.setAttribute('aria-label', '기록 완료, 도장 획득');
  node.innerHTML = `<div class="celebrate__stamp stamp ${item?.sport || ''}">${item ? ic(item.sport) : ic('check')}<strong>${esc(item?.venue || '')}</strong><span>${esc(stamp ? stampLabel(stamp, me.id) : '기록 완료')}</span><em>${dotDate(item?.date || today()).slice(5)}</em></div>${Array.from({ length: 12 }, (_, index) => `<i class="spark" style="--a:${index * 30}deg"></i>`).join('')}`;
  let gone = false;
  const dismiss = () => { if (gone) return; gone = true; node.classList.add('out'); setTimeout(() => node.remove(), 280); };
  node.addEventListener('click', dismiss);
  document.body.append(node);
  setTimeout(dismiss, 1900);
}

function render() {
  if (corrupt) {
    root.innerHTML = `<main class="recovery">${ic('alert')}<h1>데모 데이터를 읽을 수 없어요</h1><p>자동으로 지우지 않았어요. 새로 시작하면 이 브라우저의 데모 데이터가 지워져요.</p><button class="btn primary" data-action="reset-storage">${ic('refresh')}새로 시작</button></main>`;
    return;
  }
  const me = user(state.activeUserId);
  const page = route();
  // A highlight survives the follow-up route render, then expires.
  if (pulseId && pulseId !== pulseFor) { pulseFor = pulseId; pulseUntil = performance.now() + 700; }
  if (pulseId && performance.now() >= pulseUntil) { pulseId = null; pulseFor = null; }
  const pageViews = { home: homePage, matches: matchesPage, activity: activityPage, people: peoplePage, groups: groupsPage, profile: profilePage, ranking: rankingPage, notifications: notificationsPage };
  const unread = state.notifications.filter((item) => item.userId === me.id && !item.read).length;
  const modalContent = modal ? modal.type === 'create' ? createModal(me, modal.groupId) : modal.type === 'details' ? detailModal(match(modal.id), me) : modal.type === 'result' ? resultModal(match(modal.id)) : modal.type === 'profile' ? profileModal(modal.id, me) : modal.type === 'invite' ? inviteModal(modal.id, me) : modal.type === 'group-create' ? groupCreateModal(me) : modal.type === 'group-detail' ? groupDetailModal(group(modal.id), me) : modal.type === 'onboard' ? onboardingModal() : modal.type === 'cancel-confirm' ? cancelConfirmModal(match(modal.id)) : modal.type === 'card-loading' ? cardLoadingModal() : modal.type === 'reset-confirm' ? resetConfirmModal() : cardModal() : '';
  const entering = page !== lastPage; lastPage = page;
  const modalKey = modal ? `${modal.type}:${modal.id || modal.kind || ''}` : null;
  const modalEnter = modalKey && modalKey !== lastModalKey; lastModalKey = modalKey;
  const switcher = `<label class="who">${avatar(me.id, 'sm')}<span class="who__name">${esc(me.name)}</span>${ic('down')}<select id="user-switch" aria-label="데모 사용자 전환">${state.users.map((person) => `<option value="${esc(person.id)}" ${person.id === me.id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></label>`;
  root.innerHTML = `<div class="shell"><aside class="side ${entering ? 'moved' : ''}"><a href="#/home" class="brand">DWNC<span>✳</span></a><nav aria-label="주 메뉴">${navLink('home', '홈', 'home')}${navLink('matches', '매칭', 'search')}${navLink('activity', '내 운동', 'calendar')}${navLink('ranking', '랭킹', 'trophy')}${navLink('profile', '프로필', 'user')}${navLink('people', '친구', 'users')}${navLink('groups', '그룹', 'flag')}${navLink('notifications', '알림', 'bell', unread)}</nav></aside><div class="main"><header class="top"><a href="#/home" class="brand">DWNC<span>✳</span></a><span class="demo-tag" title="이 기기에만 저장되는 데모">DEMO</span><span class="top__spacer"></span><a href="#/notifications" class="icon-btn bell ${unread ? 'has' : ''}" aria-label="알림 ${unread}개">${ic('bell')}${unread ? `<b class="dot-count">${unread}</b>` : ''}</a>${switcher}</header>${storageMode === 'memory' ? `<div class="banner">${ic('alert')}이 탭에서만 유지돼요</div>` : ''}${conflict ? `<div class="banner bad">${ic('alert')}다른 탭에서 바뀌었어요 <button class="btn sm soft" data-action="reload-state">${ic('refresh')}불러오기</button></div>` : ''}<main class="content ${entering ? 'enter' : ''}" data-page="${page}">${pageViews[page](me)}</main></div></div><nav class="tabbar ${entering ? 'moved' : ''}" aria-label="하단 메뉴">${navLink('home', '홈', 'home')}${navLink('matches', '매칭', 'search')}${navLink('activity', '내 운동', 'calendar')}${navLink('ranking', '랭킹', 'trophy')}${navLink('profile', '프로필', 'user')}</nav>${modalContent ? `<div class="backdrop ${modalEnter ? 'enter' : ''}" data-action="close"><div class="sheet-wrap">${modalContent}</div></div>` : ''}`;
  restoreDrafts();
  document.body.classList.toggle('dialog-open', Boolean(modalContent));
  root.querySelector('.shell').inert = Boolean(modalContent);
  root.querySelector('.tabbar').inert = Boolean(modalContent);
  if (modalContent) root.querySelector('[role="dialog"]')?.focus({ preventScroll: true });
  if (pulseId) root.querySelectorAll(`[data-id="${CSS.escape(pulseId)}"]`).forEach((node) => node.classList.add('pulse'));
  if (flash) { const { text, error, icon } = flash; flash = null; showToast(text, error, icon); }
  if (entering && page === 'home') countUp();
  if (page === 'profile' && newStampId) newStampId = null;
  listAnimate = false;
  document.title = `DWNC · ${pageTitle[page]}`;
}
function countUp() {
  if (reduceMotion()) return;
  root.querySelectorAll('[data-count]').forEach((node) => {
    const target = Number(node.dataset.count), started = performance.now();
    const step = (now) => { const t = Math.min(1, (now - started) / 700); node.textContent = Math.round(target * (1 - (1 - t) ** 3)); if (t < 1) requestAnimationFrame(step); };
    node.textContent = '0'; requestAnimationFrame(step);
  });
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
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, user: userId, decision, kind } = button.dataset;
  if (action === 'close' && button.classList.contains('backdrop') && event.target !== button) return;
  if (action !== 'export-card') cardRequestId++;
  let exportRequestId = null;
  try {
    if (action === 'close') closeModal();
    else if (action === 'reload-state') location.reload();
    else if (action === 'create') { openModal({ type: 'create' }, button); setCreateControls(); restoreDrafts(); setCreateVisibility(); }
    else if (action === 'create-group-match') { openModal({ type: 'create', groupId: id }, button); setCreateControls(); restoreDrafts(); setCreateVisibility(); }
    else if (action === 'onboard') { openModal({ type: 'onboard' }, button); }
    else if (action === 'create-group') { openModal({ type: 'group-create' }, button); }
    else if (action === 'group-detail') { openModal({ type: 'group-detail', id }, button); }
    else if (action === 'join-group') { modal = null; pulseId = id; save(d.joinGroup(state, id, state.activeUserId), '그룹 가입', 'flag'); }
    else if (action === 'details') { if (modal?.type === 'result') closeModal(); else openModal({ type: 'details', id }, button); }
    else if (action === 'result') { openModal({ type: 'result', id }, button); }
    else if (action === 'view-profile') { openModal({ type: 'profile', id }, button); }
    else if (action === 'invite') { openModal({ type: 'invite', id }, button); }
    else if (action === 'apply') { modal = null; pulseId = id; save(d.requestMatch(state, id, state.activeUserId), '신청 완료', 'send'); }
    else if (action === 'decide') { modal = { type: 'details', id }; pulseId = `${id}:${userId}`; save(d.decideMatchRequest(state, id, state.activeUserId, userId, decision), decision === 'accepted' ? '수락 완료' : '거절함', decision === 'accepted' ? 'check' : 'x'); }
    else if (action === 'withdraw') { modal = null; pulseId = id; save(d.withdrawMatch(state, id, state.activeUserId), '철회함', 'undo'); }
    else if (action === 'cancel-match') { openModal({ type: 'cancel-confirm', id }, button); }
    else if (action === 'confirm-cancel') { modal = null; pulseId = id; save(d.cancelMatch(state, id, state.activeUserId), '자리 취소됨', 'trash'); }
    else if (action === 'friend-decide') save(d.decideFriendRequest(state, id, state.activeUserId, decision), decision === 'accepted' ? '친구가 됐어요' : '거절함', decision === 'accepted' ? 'users' : 'x');
    else if (action === 'friend-direct') { const target = user(id); modal = null; save(d.sendFriendRequest(state, state.activeUserId, target.friendCode), '친구 신청 보냄', 'userplus'); }
    else if (action === 'invite-decide') save(d.decideInvitation(state, id, state.activeUserId, decision), decision === 'accepted' ? '일정에 추가됨' : '거절함', decision === 'accepted' ? 'calendar' : 'x');
    else if (action === 'filter-sport') { const form = root.querySelector('#filter-form'); form.querySelector('[name="sport"]').value = id; if (filters.sport !== id) form.querySelector('[name="format"]').value = ''; applyFilters(form); }
    else if (action === 'toggle-filters') { advancedFiltersOpen = !advancedFiltersOpen; render(); }
    else if (action === 'reset-filters') { advancedFiltersOpen = false; filters = emptyFilters(); listAnimate = true; render(); }
    else if (action === 'rank-sport') { rankFilter = { ...rankFilter, sport: id }; listAnimate = true; render(); }
    else if (action === 'rank-period') { rankFilter = { ...rankFilter, period: id, month: today().slice(0, 7) }; listAnimate = true; render(); }
    else if (action === 'toggle-edit') { profileEditOpen = !profileEditOpen; render(); if (profileEditOpen) root.querySelector('.edit-panel')?.scrollIntoView({ behavior: reduceMotion() ? 'instant' : 'smooth', block: 'start' }); }
    else if (action === 'copy-code') { try { await navigator.clipboard.writeText(id); showToast('코드 복사됨', false, 'copy'); } catch { showToast(id, false, 'copy'); } }
    else if (action === 'remove-photo') save(d.setProfilePhoto(state, state.activeUserId, null), '사진 삭제', 'trash');
    else if (action === 'read-all') save(d.markAllNoticesRead(state, state.activeUserId), '모두 읽음', 'checks');
    else if (action === 'open-notice') { const notice = state.notifications.find((item) => item.id === id && item.userId === state.activeUserId); if (!notice) throw new old.DomainError('알림을 찾을 수 없습니다.'); save(d.markNoticeRead(state, id, state.activeUserId), null); location.hash = notice.route; routeModal(); render(); }
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
    else if (action === 'reset-demo') { openModal({ type: 'reset-confirm' }, button); }
    else if (action === 'reset-storage') { modal = null; modalStack.length = 0; drafts.clear(); filters = emptyFilters(); profileEditOpen = false; rankFilter = { ...rankFilter, month: today().slice(0, 7) }; if (location.hash !== '#/home') history.replaceState(null, '', '#/home'); try { localStorage.removeItem(old.STORAGE_KEY); savedRaw = null; } catch { storageMode = 'memory'; } corrupt = false; state = d.createExtendedSeed(); save(state, '새로 시작', 'refresh'); }
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
    if (target.id === 'user-switch') { modalStack.length = 0; modal = null; profileEditOpen = false; lastPage = null; save(d.switchDemoUser(state, target.value), name(target.value), 'user'); return; }
    if (target.form?.id === 'filter-form' && target.id !== 'filter-query') { applyFilters(target.form); return; }
    if (target.form?.id === 'ranking-form') { const data = Object.fromEntries(new FormData(target.form)); rankFilter = { ...rankFilter, region: data.region, venue: target.name === 'region' ? '' : data.venue }; listAnimate = true; render(); return; }
    if (target.name === 'chosenSports') syncProfileSports();
    if (target.name === 'sport' && target.form?.id === 'create-form') setCreateControls();
    if (target.id === 'create-format') { const capacity = root.querySelector('#create-capacity'); if (capacity) capacity.value = target.value === 'doubles' ? 4 : 2; }
    if (target.id === 'create-visibility') setCreateVisibility();
    if (target.id === 'profile-photo' && target.files?.[0]) { const ownerId = state.activeUserId; const url = await makePhoto(target.files[0]); if (state.activeUserId !== ownerId) return; save(d.setProfilePhoto(state, ownerId, url), '사진 저장', 'camera'); }
  } catch (error) { feedback(error.message || '변경을 완료하지 못했습니다.'); }
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target, formData = new FormData(form, event.submitter), values = Object.fromEntries(formData);
  submittedForm = form;
  try {
    if (form.id === 'filter-form') { applyFilters(form); return; }
    if (form.id === 'ranking-form') return;
    if (form.id === 'note-form') { save(d.setDailyNote(state, state.activeUserId, today(), values.note), '한 줄 저장', 'edit'); return; }
    if (form.id === 'friend-form') { save(d.sendFriendRequest(state, state.activeUserId, values.code), '친구 신청 보냄', 'userplus'); return; }
    if (form.id === 'group-form') { const created = d.createGroup(state, state.activeUserId, values); modal = null; pulseId = created.id; save(created.state, '그룹 생성', 'flag'); return; }
    if (form.id === 'onboarding-form') { const created = d.createDemoUser(state, { ...values, chosenSports: formData.getAll('chosenSports') }); modal = null; profileEditOpen = true; save(created.state, '새 인물', 'userplus'); location.hash = '#/profile'; return; }
    if (form.id === 'create-form') { const created = d.makeMatch(state, state.activeUserId, values); modal = null; pulseId = created.id; save(created.state, '자리 등록', 'plus'); location.hash = '#/activity'; return; }
    if (form.id === 'profile-form') {
      const sports = Object.fromEntries(formData.getAll('chosenSports').map((sport) => [sport, { experience: values[`${sport}-experience`], level: values[`${sport}-level`], preference: values[`${sport}-preference`], ...(sport === 'tennis' ? { ntrp: values['tennis-ntrp'] } : {}) }]));
      const next = d.editProfile(state, state.activeUserId, { ...values, chosenSports: formData.getAll('chosenSports'), sports }); profileEditOpen = false; save(next, '프로필 저장', 'check'); return;
    }
    if (form.id === 'invite-form') { modal = null; save(d.inviteToMatch(state, values.matchId, state.activeUserId, form.dataset.target), '초대 보냄', 'send'); return; }
    if (form.id === 'result-form') {
      const item = match(form.dataset.id), attendedIds = formData.getAll('attended');
      let payload = { attendedIds };
      if (item.sport === 'tennis') payload = { ...payload, noContest: formData.has('noContest'), teamAIds: old.participants(item).filter((id) => values[`team-${id}`] === 'A'), scoreA: values.scoreA, scoreB: values.scoreB };
      else if (item.sport === 'futsal') payload = { ...payload, scoreFor: values.scoreFor, scoreAgainst: values.scoreAgainst, mvpUserId: values.mvpUserId, positions: Object.fromEntries(old.participants(item).map((id) => [id, values[`position-${id}`]])) };
      else payload = { ...payload, entries: Object.fromEntries(attendedIds.map((id) => { const [minute, second] = String(values[`pace-${id}`] || '').split(':').map(Number); return [id, { distanceKm: values[`distance-${id}`], paceSec: minute * 60 + second }]; })), reviews: Object.fromEntries(attendedIds.map((id) => [id, values[`review-${id}`]])) };
      const next = d.saveResult(state, item.id, state.activeUserId, payload); modal = null; modalStack.length = 0;
      newStampId = item.id; pulseId = item.id; save(next, '기록 완료 · 도장 획득', 'check');
      if (!reduceMotion()) showCelebrate(item.id);
      return;
    }
    if (form.classList.contains('rate-form')) { const next = d.rateParticipant(state, form.dataset.match, state.activeUserId, form.dataset.target, values.value); modal = { type: 'details', id: form.dataset.match }; save(next, `매너 ${values.value}점`, 'star'); }
  } catch (error) { feedback(error.message || '입력을 확인해 주세요.'); } finally { submittedForm = null; }
});

window.addEventListener('storage', (event) => {
  if (event.key !== old.STORAGE_KEY || storageMode !== 'saved' || event.newValue === savedRaw) return;
  conflict = true; modal = null; render();
});
window.addEventListener('hashchange', () => { cardRequestId++; routeModal(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
window.addEventListener('keydown', (event) => {
  if (!modal) return;
  if (event.key === 'Escape') { closeModal(); return; }
  if (event.key !== 'Tab') return;
  const dialog = root.querySelector('[role="dialog"]');
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((element) => element.offsetParent !== null);
  if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  else if (document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
});
routeModal();
render();
