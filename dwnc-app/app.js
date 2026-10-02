import * as old from './domain.js';
import * as d from './extended-domain.js';

const root = document.getElementById('app');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const today = old.today;
const dateText = (date) => { const [year, month, day] = date.split('-').map(Number); return `${month}월 ${day}일 (${['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()]})`; };
const paceText = (seconds) => seconds ? `${Math.floor(seconds / 60)}′${String(seconds % 60).padStart(2, '0')}″` : '—';
const icons = { tennis: '◎', futsal: '✳', running: '↗' };
const statusText = { pending: '신청 대기', accepted: '참가 확정', rejected: '신청 거절', expired: '신청 종료' };
const pages = ['home', 'matches', 'activity', 'people', 'groups', 'profile', 'ranking', 'notifications'];
let state, storageMode = 'saved', corrupt = false, conflict = false, savedRaw = null, modal = null, flash = null, cardUrl = null, cardRequestId = 0;
let filters = { sport: '', format: '', region: '', venue: '', date: '', time: '', level: '', query: '', openOnly: true, minOpenSeats: '' };
const drafts = new Map();
const modalStack = [];
let submittedForm = null, returnFocus = null, returnScroll = 0;
let advancedFiltersOpen = false;
let rankFilter = { sport: 'tennis', region: '', venue: '', period: 'month', month: today().slice(0, 7) };

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

function save(next, message) {
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
  flash = { text: storageMode === 'saved' ? message : `${message} · 저장할 수 없어 현재 탭에서만 유지됩니다.`, error: storageMode !== 'saved' };
  render();
}
function feedback(message, error = true) {
  const node = document.getElementById('feedback');
  if (!node) return;
  node.textContent = message; node.className = `feedback ${error ? 'error' : 'success'}`; node.hidden = false;
}
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
      const value = draft.find(item => item.name === el.name && (el.type !== 'checkbox' || item.value === el.value));
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
  if (modal) modalStack.push({ modal, focus: focusKey(opener), scroll: root.querySelector('.modal-backdrop')?.scrollTop || 0 });
  else { returnFocus = focusKey(opener); returnScroll = window.scrollY; }
  modal = next;
  render();
}
function closeModal() {
  cardRequestId++;
  const parent = modalStack.pop();
  modal = parent?.modal || null;
  render();
  const target = parent?.focus || returnFocus;
  if (target) root.querySelector(target)?.focus({ preventScroll: true });
  if (parent) root.querySelector('.modal-backdrop')?.scrollTo(0, parent.scroll);
  else window.scrollTo({ top: returnScroll, behavior: 'instant' });
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
function avatar(id, size = '') { const person = user(id); return `<span class="avatar ${size}">${person?.photo ? `<img src="${esc(person.photo)}" alt="">` : esc(person?.avatar || person?.name?.slice(-1) || '?')}</span>`; }
function icon(sport, size = '') { return `<span class="sport-icon ${sport} ${size}" aria-hidden="true">${icons[sport]}</span>`; }
function select(values, selected, placeholder = '') { return `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${values.map((value) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('')}`; }
function sportSelect(selected, placeholder = '전체 종목') { return `${placeholder ? `<option value="">${placeholder}</option>` : ''}${old.SPORTS.map((sport) => `<option value="${sport}" ${sport === selected ? 'selected' : ''}>${old.SPORT_LABEL[sport]}</option>`).join('')}`; }
function myStatus(item) { const application = item.applications.find(a => a.userId === state.activeUserId); return item.hostId === state.activeUserId ? 'host' : application?.closedReason ? 'expired' : application?.status || ''; }
function isDone(item) { return old.isCompleted(state, item.id); }
function badge(item) {
  if (item.status === 'cancelled') return '<span class="badge rejected">취소됨</span>';
  if (isDone(item)) return '<span class="badge done">운동 완료</span>';
  if (d.recruitmentClosed(item)) return '<span class="badge full">모집 종료</span>';
  const status = myStatus(item);
  if (status === 'host') return '<span class="badge host">내가 모집</span>';
  if (status) return `<span class="badge ${status}">${statusText[status]}</span>`;
  return old.openSeats(item) ? `<span class="badge open">${old.openSeats(item)}자리 남음</span>` : '<span class="badge full">모집 마감</span>';
}
function resultSummary(result, item, userId) {
  if (!result) return '';
  if (item.sport === 'tennis') {
    if (result.noContest) return '참가 인원 부족 · 경기 미성립';
    const score = result.scoreA === null ? '이전 기록 · 점수 미입력' : `${result.scoreA}:${result.scoreB}`;
    if (!result.attendedIds.includes(userId)) return `승리 팀 ${result.teams[result.winnerTeam].map(name).join('·')} · ${score}`;
    return `${result.teams[result.winnerTeam].includes(userId) ? '승리' : '패배'} · ${score}`;
  }
  if (item.sport === 'futsal') return `우리 팀 ${result.teamOutcome === 'win' ? '승' : result.teamOutcome === 'loss' ? '패' : '무'} ${result.scoreFor}:${result.scoreAgainst}${result.mvpUserId === userId ? ' · MVP' : ''}`;
  const entry = result.entries[userId]; return entry ? `${entry.distanceKm}km · ${paceText(entry.paceSec)}/km` : '불참';
}
function resultReadback(result, item) {
  const rows = old.participants(item).map((id) => {
    let detail = '불참 · 기록과 평가에서 제외';
    if (result.attendedIds.includes(id)) {
      if (item.sport === 'tennis') {
        if (result.noContest) detail = '참석 · 인원 부족으로 경기 미성립';
        else {
          const team = result.teams.findIndex((members) => members.includes(id));
          const score = result.scoreA === null ? '이전 기록 · 점수 미입력' : `${result.scoreA}:${result.scoreB}`;
          detail = `팀 ${team === 0 ? 'A' : 'B'} · ${team === result.winnerTeam ? '승리' : '패배'} · ${score}`;
        }
      } else if (item.sport === 'futsal') {
        detail = `${result.positions?.[id] || '포지션 기록 없음'}${result.mvpUserId === id ? ' · MVP' : ''} · 우리 팀 ${result.scoreFor}:${result.scoreAgainst}`;
      } else {
        const entry = result.entries[id];
        detail = `${entry.distanceKm}km · ${paceText(entry.paceSec)}/km`;
      }
    }
    return `<li><strong>${esc(name(id))}</strong><span>${esc(detail)}</span>${item.sport === 'running' && result.attendedIds.includes(id) ? `<small>후기: ${esc(result.reviews?.[id] || '작성하지 않음')}</small>` : ''}</li>`;
  }).join('');
  return `<section class="result-breakdown"><h3>참가자별 결과</h3><ul>${rows}</ul></section>`;
}
function statLine(userId, sport, scope = {}) {
  const stats = d.statsFor(state, userId, scope);
  return sport === 'tennis' ? `${stats.tennis.games}경기 · ${stats.tennis.wins}승 ${stats.tennis.losses}패 · 승률 ${stats.tennis.winRate}%` : sport === 'futsal' ? `${stats.futsal.games}경기 · ${stats.futsal.wins}승 ${stats.futsal.losses}패 ${stats.futsal.draws}무 · MVP ${stats.futsal.mvp}회` : `${stats.running.runs}회 · ${stats.running.distanceKm}km · ${paceText(stats.running.paceSec)}/km`;
}
function navLink(page, label, symbol) { return `<a href="#/${page}" class="${route() === page ? 'active' : ''}" ${route() === page ? 'aria-current="page"' : ''}><span aria-hidden="true">${symbol}</span>${label}</a>`; }
function matchCard(item) {
  return `<article class="match-card"><div class="match-card__top">${icon(item.sport)}<span class="sport-name">${old.SPORT_LABEL[item.sport]} · ${d.FORMAT_LABEL[item.format]}</span>${badge(item)}</div><h3>${esc(item.title)}</h3><p>${dateText(item.date)} ${esc(item.startTime)}–${esc(item.endTime)}<br>${esc(item.region)} · ${esc(item.venue)}</p>${item.visibility !== 'public' ? `<div class="card-tags"><span>${d.VISIBILITY_LABEL[item.visibility]}</span>${item.groupId ? `<span>${esc(group(item.groupId)?.name)}</span>` : ''}</div>` : ''}${fitChips(item)}<div class="match-card__foot"><span>${old.participants(item).length}/${item.capacity}명 · ${esc(item.level)}</span><button type="button" data-action="details" data-id="${esc(item.id)}" class="text-link">자세히 보기 ↗</button></div></article>`;
}

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
  return `<div class="play-ring" style="--ring:${fill}" role="img" aria-label="종목별 운동 비율: ${esc(label)}"><div><strong>${identity.total}</strong><small>함께한 운동</small></div></div>`;
}
// The signature view: one person, several sports, each judged by its own metric.
function playCard(personId, variant = 'home') {
  const person = user(personId), identity = d.sportIdentity(state, personId);
  if (!person || !identity) return '';
  const tiles = identity.sports.map((item) => { const metric = sportMetric(identity.stats, item.sport); return `<li class="play-tile ${item.sport}"><span class="play-tile__sport"><i aria-hidden="true">${icons[item.sport]}</i>${old.SPORT_LABEL[item.sport]}<em>${esc(item.level)}</em></span><strong>${esc(metric.value)}</strong><small>${metric.label} · ${esc(metric.sub)}</small></li>`; }).join('');
  const together = variant === 'other' && personId !== state.activeUserId ? d.playedTogether(state, state.activeUserId, personId) : null;
  const who = variant === 'profile'
    ? `<div class="play-card__who"><small>${identity.sports.length}종목 · 이번 달 ${identity.monthTotal}회</small><strong>함께 운동한 사람 ${identity.partners}명</strong><small>매너 ${d.mannerFor(state, personId).toFixed(1)} · 기록 ${identity.total}건</small></div>`
    : variant === 'other'
    ? `<div class="play-card__who"><small>${identity.sports.length}종목 · 이번 달 ${identity.monthTotal}회</small><strong>${together ? `나와 함께 ${together}회 운동` : personId === state.activeUserId ? '내 플레이 카드' : '아직 함께한 기록 없음'}</strong><small>매너 ${d.mannerFor(state, personId).toFixed(1)}</small></div>`
    : `<div class="play-card__who">${avatar(personId, 'large')}<strong>${esc(person.name)}</strong><small>${esc(person.region)} · 매너 ${d.mannerFor(state, personId).toFixed(1)}</small><small>이번 달 ${identity.monthTotal}회 움직였어요</small></div>`;
  return `<section class="play-card ${variant}" aria-label="${esc(person.name)}님의 멀티 스포츠 플레이 카드"><div class="play-card__head"><span class="eyebrow">${variant === 'other' ? 'PLAY CARD' : 'MY PLAY CARD'}</span><span class="play-card__tag">${identity.sports.length}종목러</span></div><div class="play-card__body">${playRing(identity)}${who}</div><ul class="play-tiles">${tiles}</ul>${variant === 'home' ? '<a class="play-card__link" href="#/profile">프로필 · 공유 카드 ↗</a>' : ''}</section>`;
}
function fitChips(item) {
  const chips = d.matchFit(state, item, state.activeUserId);
  return chips.length ? `<div class="fit-chips" aria-label="나와의 연결">${chips.map((chip) => `<span class="fit-chip ${chip.kind}">${esc(chip.text)}</span>`).join('')}</div>` : '';
}
function todaySummary(items) {
  if (!items.length) return '';
  const sports = [...new Set(items.map(({ match: item }) => item.sport))];
  const done = items.filter(({ result }) => result).length;
  return `<p class="today-sum">${sports.map((sport) => `<span class="sum-sport"><span class="dot ${sport}" aria-hidden="true"></span>${old.SPORT_LABEL[sport]}</span>`).join('')}<span>· ${items.length}건 중 ${done}건 완료</span></p>`;
}

function homePage(me) {
  const todayItems = d.activityFor(state, me.id);
  const suggestions = d.filterMatches(state, me.id, { openOnly: true, region: me.region }).filter((item) => item.hostId !== me.id && !item.applications.some((a) => a.userId === me.id)).slice(0, 3);
  const note = state.dailyNotes[me.id]?.[today()] || '';
  const completed = state.results.filter((r) => r.attendedIds.includes(me.id)).length;
  return `<div class="home-layout"><div class="home-main"><section class="hero"><div class="hero-copy"><p class="eyebrow">MOVE WITH SOMEONE</p><h1>오늘도, 같이<br><em>움직여볼까요?</em></h1><p>한 사람의 여러 운동이 이어지는 곳.<br>${esc(me.name)}님의 다음 움직임을 만나보세요.</p><div class="hero-actions"><a class="button primary" href="#/matches">내 주변 매칭 보기 ↗</a><button class="button ghost" data-action="create">운동 자리 만들기 ＋</button></div></div><div class="hero-art" aria-hidden="true"><div class="orbit outer"></div><div class="orbit inner"></div><div class="hero-ball"></div><span>PLAY<br>MORE.</span></div></section>${playCard(me.id)}<div class="section-heading"><div><span class="eyebrow">01 / TODAY</span><h2>오늘의 움직임</h2>${todaySummary(todayItems)}</div><a href="#/activity" class="text-link">내 운동 전체 보기 ↗</a></div><div class="today-grid">${todayItems.length ? todayItems.map(({ match: item, result }) => `<article class="today-card ${item.sport}"><div class="today-card__top"><span class="badge ${result ? 'done' : item.status === 'cancelled' ? 'rejected' : 'upcoming'}">${result ? '완료' : item.status === 'cancelled' ? '취소' : '예정'}</span><b>${esc(item.startTime)}</b></div><div class="today-card__bottom">${icon(item.sport)}<div><small>${old.SPORT_LABEL[item.sport]} · ${esc(item.venue)}</small><strong>${esc(item.title)}</strong><p>${result ? esc(resultSummary(result, item, me.id)) : item.status === 'cancelled' ? '취소된 일정' : `${old.participants(item).length}명 확정`}</p></div></div></article>`).join('') : '<div class="empty">오늘의 운동이 아직 없어요. 새로운 자리를 찾아보세요.</div>'}</div><form id="note-form" class="daily-note"><label for="daily-note">오늘의 한 줄 운동 기록</label><div><input id="daily-note" name="note" maxlength="140" value="${esc(note)}" placeholder="오늘 몸과 마음은 어땠나요?"><button class="button outline" type="submit">저장</button></div></form><button type="button" class="button outline export-button" data-action="export-card" data-kind="today">오늘 운동 카드 미리보기 · PNG</button><div class="section-heading spaced"><div><span class="eyebrow">02 / AROUND YOU</span><h2>가까운 곳에서, 함께</h2></div><a href="#/matches" class="text-link">모든 매칭 보기 ↗</a></div><div class="match-grid">${suggestions.length ? suggestions.map(matchCard).join('') : '<div class="empty">지금 신청할 수 있는 주변 자리가 없어요. 직접 만들어 보세요.</div>'}</div></div><aside class="home-rail"><div class="rail-top"><span class="eyebrow">MY MOTION</span><a href="#/profile" aria-label="프로필 보기">↗</a></div>${avatar(me.id, 'large')}<small>운동하는 사람, ${esc(me.name)}</small><h3>종목은 달라도<br>움직이는 마음은 하나.</h3><div class="rail-stats"><div><strong>${completed}</strong><small>함께한 운동</small></div><div><strong>${d.mannerFor(state, me.id).toFixed(1)}</strong><small>매너 지수</small></div></div><div class="rail-note"><span>✳</span><p>좋아하는 운동은<br><strong>함께할 때 더 커지니까.</strong></p><small>DWNC / OUR COMMUNITY</small></div></aside></div>`;
}

function matchesPage(me) {
  const available = d.filterMatches(state, me.id, filters);
  const regions = [...new Set(d.visibleMatches(state, me.id).map(item => item.region))].sort();
  const advancedCount = ['format', 'venue', 'date', 'time', 'level', 'minOpenSeats'].filter(key => filters[key]).length;
  return `<div class="page-head"><div><span class="eyebrow">FIND YOUR PEOPLE</span><h1>같이 할 운동 찾기</h1><p>원하는 종목과 동네부터 골라보세요.</p></div><button class="button primary" data-action="create">＋ 자리 만들기</button></div>
    <div class="sport-tabs" aria-label="종목 바로 선택">${[['', '전체'], ...old.SPORTS.map(sport => [sport, old.SPORT_LABEL[sport]])].map(([sport, label]) => `<button type="button" data-action="filter-sport" data-id="${sport}" aria-pressed="${filters.sport === sport}">${sport ? icons[sport] + ' ' : ''}${label}</button>`).join('')}</div>
    <form id="filter-form" class="discovery-filter"><input type="hidden" name="sport" value="${esc(filters.sport)}">
    <div class="filter-basics"><label>지역<select name="region">${select(regions, filters.region, '전체 지역')}</select></label><label>검색<input name="query" value="${esc(filters.query)}" placeholder="장소·제목·설명"></label></div>
    <details class="advanced-filters" ${advancedFiltersOpen ? 'open' : ''}><summary>상세 조건${advancedCount ? ` · ${advancedCount}개 적용` : ''}</summary><div class="filter-panel">
    <label>경기 방식<select name="format"><option value="">전체 방식</option>${Object.entries(d.FORMAT_LABEL).map(([value, label]) => `<option value="${value}" ${filters.format === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>장소<input name="venue" value="${esc(filters.venue)}" placeholder="구장·공원"></label><label>날짜<input type="date" name="date" value="${esc(filters.date)}"></label>
    <label>시간대<select name="time"><option value="">전체 시간</option>${[['morning','오전'],['afternoon','오후'],['evening','저녁']].map(([value,label]) => `<option value="${value}" ${filters.time === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>수준<select name="level">${select(old.LEVELS, filters.level, '모든 수준')}</select></label><label>필요한 빈자리<select name="minOpenSeats">${select(['1','2','3','4'], filters.minOpenSeats, '제한 없음')}</select></label></div></details>
    <div class="filter-bottom"><label class="check-field"><input type="checkbox" name="openOnly" ${filters.openOnly ? 'checked' : ''}> 지금 신청 가능한 자리</label><div class="filter-actions"><button class="button primary" type="submit">찾기</button><button class="button outline" type="button" data-action="reset-filters">초기화</button></div></div></form>
    <div class="list-heading"><h2>운동 자리 <span>${available.length}</span></h2><span>종료 시각이 지난 자리는 신청할 수 없어요.</span></div><div class="match-grid full">${available.length ? available.map(matchCard).join('') : '<div class="empty"><strong>조건에 맞는 자리가 없어요.</strong><p>조건을 넓히거나 직접 운동을 열어보세요.</p><button class="button outline" data-action="reset-filters">조건 초기화</button> <button class="button primary" data-action="create">자리 만들기</button></div>'}</div>`;
}

function activityPage(me) {
  const mine = state.matches.filter((item) => item.hostId === me.id || item.applications.some((a) => a.userId === me.id)).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const waiting = mine.filter((item) => item.hostId === me.id && item.status === 'open' && !isDone(item) && !d.recruitmentClosed(item)).reduce((sum, item) => sum + item.applications.filter((a) => a.status === 'pending').length, 0);
  return `<div class="page-head"><div><span class="eyebrow">MY MOVEMENT</span><h1>내 운동</h1><p>확정 일정, 신청 상태와 지난 기록을 확인하세요.</p></div><button class="button primary" data-action="create">＋ 새 운동 자리</button></div><div class="activity-summary"><div><strong>${d.activityFor(state, me.id).length}</strong><span>오늘 운동</span></div><div><strong>${mine.filter((item) => item.status === 'open' && !isDone(item) && !d.recruitmentClosed(item) && (item.hostId === me.id || myStatus(item) === 'accepted')).length}</strong><span>예정 일정</span></div><div><strong>${waiting}</strong><span>응답할 신청</span></div></div><div class="section-heading"><div><span class="eyebrow">SCHEDULE & HISTORY</span><h2>내 자리와 신청</h2></div></div><div class="activity-list">${mine.length ? mine.map((item) => `<article class="activity-row">${icon(item.sport)}<div class="activity-row__body"><div class="activity-row__title">${esc(item.title)} ${badge(item)}</div><p>${dateText(item.date)} ${esc(item.startTime)} · ${esc(item.venue)} · ${old.SPORT_LABEL[item.sport]} ${d.FORMAT_LABEL[item.format]}</p><small>${isDone(item) ? esc(resultSummary(state.results.find((r) => r.matchId === item.id), item, me.id)) : item.status === 'cancelled' ? '모집자가 취소한 자리' : item.hostId === me.id ? `${item.applications.filter((a) => a.status === 'pending').length}명 신청 대기` : statusText[myStatus(item)] || ''}</small></div><button class="button outline small" data-action="details" data-id="${esc(item.id)}">상세 보기</button></article>`).join('') : '<div class="empty">참여한 운동이 없어요. 매칭에서 첫 자리를 찾아보세요.</div>'}</div>`;
}

function profilePage(me) {
  const sports = old.SPORTS.map((sport) => `<div>${icon(sport)}<strong>${old.SPORT_LABEL[sport]}</strong><span>${esc(statLine(me.id, sport))}</span></div>`).join('');
  return `<div class="page-head"><div><span class="eyebrow">MY PLAY CARD</span><h1>멀티 스포츠 프로필</h1><p>친구 코드와 종목별 기록을 한 장에 담아요.</p></div><button class="button outline" data-action="export-card" data-kind="profile">프로필 카드 미리보기 · PNG</button></div><div class="profile-layout"><section class="profile-card"><div class="profile-cover"><span>✳</span><b>MOVE TOGETHER.</b></div><div class="profile-identity">${avatar(me.id, 'xl')}<h2>${esc(me.name)}</h2><p>${esc(me.region)} · ${esc(me.ageRange)} · ${esc(me.gender || '미입력')}</p><span class="badge open">매너 ${d.mannerFor(state, me.id).toFixed(1)}</span></div><div class="photo-controls"><label>프로필 사진 (PNG/JPEG/WebP, 자동 축소)<input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp"></label>${me.photo ? '<button type="button" class="text-link" data-action="remove-photo">사진 제거</button>' : ''}</div><blockquote>${esc(me.bio || '자기소개를 적어 보세요.')}</blockquote><div class="friend-code"><small>MY FRIEND CODE</small><strong>${esc(me.friendCode)}</strong><span>같은 브라우저의 데모 인물에게 알려주세요.</span></div><div class="profile-sport-list">${me.chosenSports.map((sport) => `<div>${icon(sport)}<span><strong>${old.SPORT_LABEL[sport]}</strong><small>${esc(me.sports[sport].experience)} · ${esc(me.sports[sport].preference)}${sport === 'tennis' ? ` · NTRP ${esc(me.sports.tennis.ntrp)}` : ''}</small></span><b>${esc(me.sports[sport].level)}</b></div>`).join('')}</div></section><div class="profile-main">${playCard(me.id, 'profile')}<section class="panel"><div class="panel-head"><div><span class="eyebrow">TRACK YOUR PLAY</span><h2>운동 기록</h2></div><span class="hint">실제 참가 결과만 집계</span></div><div class="record-list">${sports}</div><p class="muted">매너 지수 = 기존 데모 기준값 5회분과 새 동료 평가의 가중 평균입니다. 본인 평가와 중복 평가는 제외됩니다.</p></section><section class="panel"><div class="panel-head"><div><span class="eyebrow">EDIT YOUR CARD</span><h2>프로필 관리</h2></div></div><form id="profile-form"><div class="form-grid"><label>이름<input name="name" required maxlength="24" value="${esc(me.name)}"></label><label>활동 지역<input name="region" required maxlength="30" value="${esc(me.region)}"></label><label>연령대<input name="ageRange" required value="${esc(me.ageRange)}"></label><label>성별<select name="gender">${select(['미입력', '여성', '남성', '기타'], me.gender)}</select></label><label>프로필 아이콘<select name="avatar">${select(d.AVATARS, me.avatar)}</select></label><fieldset class="wide sport-choices"><legend>즐기는 종목</legend><div class="check-choices">${old.SPORTS.map((sport) => `<label><input type="checkbox" name="chosenSports" value="${sport}" ${me.chosenSports.includes(sport) ? 'checked' : ''}>${old.SPORT_LABEL[sport]}</label>`).join('')}</div></fieldset><label class="wide">자기소개<textarea name="bio" maxlength="180" rows="2">${esc(me.bio)}</textarea></label></div><div class="sport-edit-grid">${old.SPORTS.map((sport) => `<fieldset data-sport-editor="${sport}"><legend>${icons[sport]} ${old.SPORT_LABEL[sport]}</legend><label>운동 경력<input name="${sport}-experience" required value="${esc(me.sports[sport].experience)}"></label><label>수준<select name="${sport}-level">${select(old.LEVELS, me.sports[sport].level)}</select></label><label>${sport === 'tennis' ? '선호 경기 방식' : sport === 'futsal' ? '선호 포지션' : '선호 거리'}<input name="${sport}-preference" required value="${esc(me.sports[sport].preference)}"></label>${sport === 'tennis' ? `<label>NTRP (1.0–7.0)<input type="number" name="tennis-ntrp" min="1" max="7" step="0.5" required value="${esc(me.sports.tennis.ntrp)}"></label>` : ''}</fieldset>`).join('')}</div><div class="profile-save"><button class="button primary" type="submit">프로필 저장</button><span>선택한 종목만 편집해요.</span></div></form></section><section class="panel demo-reset"><div><span class="eyebrow">DEMO DATA</span><h2>예시 데이터로 다시 시작</h2><p class="muted">시연 리허설용입니다. 이 브라우저의 데모 기록·사진·추가 인물이 지워지고 오늘 날짜 기준 예시로 돌아갑니다.</p></div><button type="button" class="button outline danger" data-action="reset-demo">초기화…</button></section></div></div>`;
}

function rankingPage(me) {
  const regions = [...new Set(state.matches.map((item) => item.region))].sort();
  const venues = [...new Set(state.matches.filter((item) => !rankFilter.region || item.region === rankFilter.region).map((item) => item.venue))].sort();
  let rows = d.ranking(state, rankFilter.sport, rankFilter), fallback = false;
  if (!rows.length && rankFilter.period === 'month') { const allRows = d.ranking(state, rankFilter.sport, { ...rankFilter, period: 'all' }); if (allRows.length) { rows = allRows; fallback = true; } }
  const metric = (stats) => rankFilter.sport === 'tennis' ? `${stats.tennis.winRate}% <small>${stats.tennis.games}경기</small>` : rankFilter.sport === 'futsal' ? `MVP ${stats.futsal.mvp} <small>${stats.futsal.games}경기</small>` : `${paceText(stats.running.paceSec)}/km <small>${stats.running.distanceKm}km</small>`;
  return `<div class="page-head"><div><span class="eyebrow">LOCAL PLAYERS</span><h1>지역·장소 랭킹</h1><p>선택한 기간과 지역 또는 장소에 기록이 있는 사람만 집계합니다.</p></div></div><div class="ranking-intro"><span>✳</span><p>함께 움직인 기록이<br><strong>우리 동네의 이야기가 됩니다.</strong></p></div><form id="ranking-form" class="ranking-filters"><label>종목<select name="sport">${sportSelect(rankFilter.sport, '')}</select></label><label>지역<select name="region">${select(regions, rankFilter.region, '전체 지역')}</select></label><label>장소<select name="venue">${select(venues, rankFilter.venue, '전체 장소')}</select></label><label>기간<select name="period"><option value="month" ${rankFilter.period === 'month' ? 'selected' : ''}>이번 달 / 선택 월</option><option value="all" ${rankFilter.period === 'all' ? 'selected' : ''}>전체 기록</option></select></label><label>기준 월<input type="month" name="month" value="${esc(rankFilter.month)}"></label><button class="button primary" type="submit">랭킹 보기</button></form><div class="panel rank-panel"><div class="panel-head"><div><span class="eyebrow">${old.SPORT_LABEL[rankFilter.sport]} / LEADERBOARD</span><h2>${rankFilter.region ? esc(rankFilter.region) : '전체 지역'} ${rankFilter.venue ? `· ${esc(rankFilter.venue)}` : ''}</h2></div><span class="hint">${rankFilter.period === 'all' || fallback ? '전체 기간' : `${esc(rankFilter.month)} 기록`}</span></div>${fallback ? `<p class="rank-fallback">${esc(rankFilter.month)}에는 아직 기록이 없어 전체 기간 순위를 보여드려요.</p>` : ''}${rows.length ? `<div class="ranking-list">${rows.map(({ user: person, stats }, index) => `<button type="button" data-action="view-profile" data-id="${esc(person.id)}" class="rank-row ${person.id === me.id ? 'me' : ''}"><b class="rank-num">${String(index + 1).padStart(2, '0')}</b>${avatar(person.id)}<span class="rank-person"><strong>${esc(person.name)} ${person.id === me.id ? '<em>나</em>' : ''}</strong><small>${esc(person.region)} · ${esc(person.sports[rankFilter.sport].level)}</small></span><span class="rank-metric">${metric(stats)}</span><span class="rank-arrow">↗</span></button>`).join('')}</div>` : '<div class="empty">선택한 범위의 기록이 없어요. 기간이나 장소를 바꿔 보세요.</div>'}</div>`;
}

function peoplePage(me) {
  const friends = d.friendsOf(state, me.id);
  const incoming = state.friendRequests.filter((request) => request.toId === me.id && request.status === 'pending');
  const outgoing = state.friendRequests.filter((request) => request.fromId === me.id && request.status === 'pending');
  const invites = state.invitations.filter((invite) => invite.toId === me.id && invite.status === 'pending');
  return `<div class="page-head"><div><span class="eyebrow">BETTER TOGETHER</span><h1>친구와 사람들</h1><p>친구 코드로 연결하고 실제 운동 자리로 초대해 보세요.</p></div><button class="button primary" data-action="onboard">＋ 새 데모 사용자</button></div><div class="community-grid"><section class="panel"><div class="panel-head"><div><span class="eyebrow">FRIEND CODE</span><h2>친구 추가</h2></div></div><p class="muted">내 코드: <strong>${esc(me.friendCode)}</strong> · 이 브라우저의 데모 사용자끼리만 작동합니다.</p><form id="friend-form" class="inline-form"><label>상대 친구 코드<input name="code" required placeholder="DWNC-0002" autocomplete="off"></label><button class="button primary" type="submit">신청 보내기</button></form><div class="subsection"><h3>받은 친구 신청</h3>${incoming.length ? incoming.map((request) => `<div class="person-row">${avatar(request.fromId)}<span><strong>${esc(name(request.fromId))}</strong><small>${esc(user(request.fromId).region)}</small></span><button class="mini-button accept" data-action="friend-decide" data-id="${esc(request.id)}" data-decision="accepted">수락</button><button class="mini-button" data-action="friend-decide" data-id="${esc(request.id)}" data-decision="rejected">거절</button></div>`).join('') : '<p class="muted">대기 중인 신청이 없습니다.</p>'}${outgoing.length ? `<p class="muted">내가 보낸 신청 ${outgoing.length}건이 응답을 기다립니다.</p>` : ''}</div></section><section class="panel"><div class="panel-head"><div><span class="eyebrow">YOUR TEAMMATES</span><h2>내 친구 ${friends.length}</h2></div></div>${friends.length ? friends.map((id) => `<div class="person-row">${avatar(id)}<span><strong>${esc(name(id))}</strong><small>${esc(user(id).region)} · 매너 ${d.mannerFor(state, id).toFixed(1)}</small></span><button class="text-link" data-action="view-profile" data-id="${esc(id)}">프로필 ↗</button></div>`).join('') : '<p class="muted">친구 코드를 입력해 첫 친구를 만나보세요.</p>'}<div class="subsection"><h3>받은 운동 초대</h3>${invites.length ? invites.map((invite) => { const item = match(invite.matchId); return `<div class="invite-row"><div><strong>${esc(item.title)}</strong><small>${dateText(item.date)} · ${esc(name(invite.fromId))}님의 초대</small></div><button class="mini-button accept" data-action="invite-decide" data-id="${esc(invite.id)}" data-decision="accepted">참여</button><button class="mini-button" data-action="invite-decide" data-id="${esc(invite.id)}" data-decision="declined">거절</button></div>`; }).join('') : '<p class="muted">새 운동 초대가 없습니다.</p>'}</div></section></div><section class="panel people-directory"><div class="panel-head"><div><span class="eyebrow">LOCAL DEMO PEOPLE</span><h2>함께할 사람들</h2></div></div><div class="people-grid">${state.users.filter((person) => person.id !== me.id).map((person) => `<button class="people-card" type="button" data-action="view-profile" data-id="${esc(person.id)}">${avatar(person.id, 'large')}<strong>${esc(person.name)}</strong><small>${esc(person.region)} · ${person.chosenSports.map((sport) => old.SPORT_LABEL[sport]).join(' / ')}</small><span>프로필 보기 ↗</span></button>`).join('')}</div></section>`;
}

function groupsPage(me) {
  const mine = state.groups.filter((item) => item.memberIds.includes(me.id));
  return `<div class="page-head"><div><span class="eyebrow">MOVE AS A GROUP</span><h1>그룹</h1><p>같이 운동할 사람, 일정과 기록을 한곳에서 만나세요.</p></div><button class="button primary" data-action="create-group">＋ 그룹 만들기</button></div><div class="section-heading"><div><span class="eyebrow">MY GROUPS</span><h2>내 그룹 ${mine.length}</h2></div></div><div class="group-grid">${state.groups.length ? state.groups.map((item) => `<article class="group-card"><span class="group-mark">✳</span><div><small>${esc(item.region)} · ${item.memberIds.length}명</small><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p></div><div class="group-card__foot"><span>운영자 ${esc(name(item.ownerId))}</span>${item.memberIds.includes(me.id) ? `<button class="button outline small" data-action="group-detail" data-id="${esc(item.id)}">그룹 보기 ↗</button>` : `<button class="button primary small" data-action="join-group" data-id="${esc(item.id)}">가입하기</button>`}</div></article>`).join('') : '<div class="empty">아직 그룹이 없어요. 첫 그룹을 만들어 보세요.</div>'}</div>`;
}

function notificationsPage(me) {
  const notices = state.notifications.filter((item) => item.userId === me.id);
  return `<div class="page-head"><div><span class="eyebrow">YOUR UPDATES</span><h1>알림</h1><p>친구, 초대와 운동 자리의 변경을 확인하세요.</p></div>${notices.some((item) => !item.read) ? '<button class="button outline" data-action="read-all">모두 읽음</button>' : ''}</div><div class="panel notice-list">${notices.length ? notices.map((notice) => `<button class="notice-row ${notice.read ? '' : 'unread'}" type="button" data-action="open-notice" data-id="${esc(notice.id)}"><span class="notice-dot"></span><span><strong>${esc(notice.text)}</strong><small>${new Date(notice.at).toLocaleString('ko-KR')}</small></span><b>↗</b></button>`).join('') : '<div class="empty">아직 알림이 없습니다.</div>'}</div>`;
}

function modalFrame(label, title, body, wide = false) {
  return `<div class="modal-card ${wide ? 'wide-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">${modalStack.length ? '<button type="button" class="modal-back" data-action="close">← 이전 화면</button>' : ''}<div class="modal-head"><div><span class="eyebrow">${label}</span><h2 id="modal-title">${esc(title)}</h2></div><button type="button" data-action="close" class="close" aria-label="닫기">×</button></div>${body}</div>`;
}
function createModal(me, presetGroupId = null) {
  const memberGroups = state.groups.filter((item) => item.memberIds.includes(me.id));
  const body = `<p class="modal-intro">${esc(me.name)}님이 직접 여는 데모 운동 자리입니다. 친구·그룹 범위도 이 브라우저 안에서만 적용됩니다.</p><form id="create-form"><div class="form-grid"><label>종목<select name="sport" id="create-sport" required>${sportSelect('tennis', '')}</select></label><label>경기 방식<select name="format" id="create-format"><option value="singles">단식</option><option value="doubles">복식</option></select></label><label>제목<input name="title" maxlength="60" required placeholder="함께할 운동을 소개해 주세요"></label><label>지역<input name="region" maxlength="30" required value="${esc(me.region)}"></label><label>장소<input name="venue" maxlength="60" required placeholder="구장 또는 공원 이름"></label><label>날짜<input type="date" name="date" required min="${today()}" value="${today()}"></label><label>시작 시간<input type="time" name="startTime" required value="19:00"></label><label>종료 시간<input type="time" name="endTime" required value="20:00"></label><label>정원<input type="number" id="create-capacity" name="capacity" min="2" max="20" required value="2"></label><label>필요 수준<select name="level">${select(old.LEVELS, '무관')}</select></label><label>공개 범위<select name="visibility" id="create-visibility"><option value="public" ${presetGroupId ? '' : 'selected'}>전체 공개</option><option value="friends">친구 공개</option><option value="group" ${presetGroupId ? 'selected' : ''}>그룹 공개</option></select></label><label id="group-select-label" ${presetGroupId ? '' : 'hidden'}>그룹<select name="groupId">${memberGroups.map((item) => `<option value="${esc(item.id)}" ${presetGroupId === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label class="wide">모집 설명<textarea name="description" required maxlength="500" rows="3" placeholder="어떤 운동을 함께할지 적어 주세요"></textarea></label></div><div class="modal-actions"><button type="button" class="button outline" data-action="close">취소</button><button type="submit" class="button primary">자리 등록</button></div></form>`;
  return modalFrame('HOST A PLAY', '운동 자리 만들기', body, true);
}
function onboardingModal() {
  const body = `<p class="modal-intro">새 가상 인물을 이 브라우저에 추가합니다. 실제 회원가입이나 인증은 아닙니다.</p><form id="onboarding-form"><div class="form-grid"><label>이름<input name="name" required maxlength="24" placeholder="이름"></label><label>활동 지역<input name="region" required maxlength="30" placeholder="예: 관악구"></label><label>연령대<input name="ageRange" required placeholder="예: 20대"></label><label>성별<select name="gender">${select(['미입력', '여성', '남성', '기타'], '미입력')}</select></label><label>프로필 아이콘<select name="avatar">${select(d.AVATARS, '✳')}</select></label><fieldset class="wide sport-choices"><legend>즐기는 종목</legend><div class="check-choices">${old.SPORTS.map((sport) => `<label><input type="checkbox" name="chosenSports" value="${sport}" ${sport === 'tennis' ? 'checked' : ''}>${old.SPORT_LABEL[sport]}</label>`).join('')}</div></fieldset><label class="wide">자기소개<textarea name="bio" maxlength="180" rows="2"></textarea></label></div><div class="modal-actions"><button type="button" class="button outline" data-action="close">취소</button><button type="submit" class="button primary">데모 사용자 만들기</button></div></form>`;
  return modalFrame('NEW LOCAL PROFILE', '새 데모 사용자', body, true);
}
function groupCreateModal(me) {
  const body = `<p class="modal-intro">새 그룹은 이 브라우저의 데모 사용자들이 가입할 수 있습니다.</p><form id="group-form"><div class="form-grid"><label>그룹 이름<input name="name" maxlength="40" required placeholder="예: 관악 러너스"></label><label>활동 지역<input name="region" maxlength="30" required value="${esc(me.region)}"></label><label class="wide">소개<textarea name="description" maxlength="300" rows="3" placeholder="우리 그룹을 소개해 주세요"></textarea></label></div><div class="modal-actions"><button type="button" class="button outline" data-action="close">취소</button><button type="submit" class="button primary">그룹 만들기</button></div></form>`;
  return modalFrame('OUR COMMUNITY', '그룹 만들기', body);
}
function groupDetailModal(item, me) {
  if (!item) return '';
  const member = item.memberIds.includes(me.id);
  const schedule = member ? state.matches.filter((match) => match.groupId === item.id).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const summary = d.groupSummary(state, item.id);
  const body = `<p class="modal-intro">${esc(item.region)} · 운영자 ${esc(name(item.ownerId))}<br>${esc(item.description)}</p><div class="participant-block"><h3>멤버 ${item.memberIds.length}</h3>${item.memberIds.map((id) => `<button class="person-pill" data-action="view-profile" data-id="${esc(id)}">${avatar(id)}${esc(name(id))} ↗</button>`).join('')}</div>${member ? `<div class="group-summary"><div><strong>${summary.games}</strong><small>완료된 그룹 운동</small></div><div><strong>${summary.futsalWinRate}%</strong><small>풋살 팀 승률 · ${summary.futsalGames}경기</small></div><div><strong>${summary.tennisInternalGames}</strong><small>테니스 내부 경기</small></div><div><strong>${summary.mvp}</strong><small>풋살 MVP 기록</small></div></div><div class="subsection"><h3>그룹 일정</h3>${schedule.length ? schedule.map((match) => `<div class="mini-schedule"><span>${dateText(match.date)} ${esc(match.startTime)}</span><button class="text-link" data-action="details" data-id="${esc(match.id)}">${esc(match.title)} ↗</button>${badge(match)}</div>`).join('') : '<p class="muted">아직 그룹 일정이 없습니다.</p>'}</div><div class="subsection"><h3>그룹 멤버 랭킹</h3>${old.SPORTS.map((sport) => { const leaders = d.ranking(state, sport, { groupId: item.id }); return `<p class="group-rank"><strong>${old.SPORT_LABEL[sport]}</strong> ${leaders.length ? leaders.map((row, index) => `${index + 1}. ${esc(row.user.name)}`).join(' · ') : '아직 기록 없음'}</p>`; }).join('')}</div><div class="modal-actions"><button class="button primary" data-action="create-group-match" data-id="${esc(item.id)}">그룹 운동 만들기</button><button class="button outline" data-action="close">닫기</button></div>` : `<p class="muted">그룹 일정과 기록은 가입 후 볼 수 있습니다.</p><div class="modal-actions"><button class="button primary" data-action="join-group" data-id="${esc(item.id)}">가입하기</button><button class="button outline" data-action="close">닫기</button></div>`}`;
  return modalFrame('GROUP SPACE', item.name, body, true);
}

function detailModal(item, me) {
  if (!d.canViewMatch(state, item, me.id)) return modalFrame('MATCH DETAIL', '볼 수 없는 운동 자리', '<p class="modal-intro">현재 사용자에게 공개되지 않았습니다.</p>');
  const status = myStatus(item), result = state.results.find((entry) => entry.matchId === item.id);
  const canApply = d.canRequestMatch(state, item, me.id);
  const canRecord = item.status === 'open' && !result && old.participants(item).includes(me.id);
  const canWithdraw = item.status === 'open' && !result && ['pending', 'accepted'].includes(status);
  const canRate = result?.attendedIds.includes(me.id);
  const rated = state.ratings.filter((rating) => rating.matchId === item.id && rating.fromId === me.id).map((rating) => rating.toId);
  const applicantRows = item.hostId === me.id ? `<div class="applicant-block"><h3>참여 신청 <small>${item.applications.filter((a) => a.status === 'pending').length}명 대기</small></h3>${item.applications.length ? item.applications.map((application) => `<div class="applicant-row"><button class="applicant-person" data-action="view-profile" data-id="${esc(application.userId)}">${avatar(application.userId)}<span><strong>${esc(name(application.userId))}</strong><small>${esc(user(application.userId).region)} · ${esc(user(application.userId).sports[item.sport].level)} · 매너 ${d.mannerFor(state, application.userId).toFixed(1)}${d.playedTogether(state, me.id, application.userId) ? ` · 함께 ${d.playedTogether(state, me.id, application.userId)}회` : ''}</small></span></button>${application.status === 'pending' && item.status === 'open' && !result ? `<div><button ${d.recruitmentClosed(item) ? 'disabled' : ''} class="mini-button accept" data-action="decide" data-id="${esc(item.id)}" data-user="${esc(application.userId)}" data-decision="accepted">수락</button><button class="mini-button" data-action="decide" data-id="${esc(item.id)}" data-user="${esc(application.userId)}" data-decision="rejected">거절</button></div>` : `<span class="status-word">${application.closedReason ? esc(application.closedReason) + ' · 신청 종료' : statusText[application.status]}</span>`}</div>`).join('') : '<p class="muted">아직 신청자가 없습니다.</p>'}</div>` : '';
  const ratingBlock = canRate ? `<div class="subsection"><h3>함께한 사람 매너 평가</h3><p class="muted">실제 참석한 다른 참가자에게 각 한 번, 1–5점을 남길 수 있습니다.</p>${result.attendedIds.filter((id) => id !== me.id).map((id) => rated.includes(id) ? `<p class="muted">${esc(name(id))}님 평가 완료</p>` : `<form class="rate-form" data-match="${esc(item.id)}" data-target="${esc(id)}"><span>${avatar(id)} ${esc(name(id))}</span><label>점수<select name="value">${[5, 4, 3, 2, 1].map((value) => `<option value="${value}">${value}점</option>`).join('')}</select></label><button class="mini-button accept" type="submit">평가</button></form>`).join('')}</div>` : '';
  const body = `<div class="detail-meta">${badge(item)}<span>${old.participants(item).length}/${item.capacity}명</span><span>${esc(item.level)}</span><span>${d.FORMAT_LABEL[item.format]}</span><span>${d.VISIBILITY_LABEL[item.visibility]}</span></div>${fitChips(item)}<dl class="detail-list"><div><dt>일정</dt><dd>${dateText(item.date)} ${esc(item.startTime)}–${esc(item.endTime)}</dd></div><div><dt>지역·장소</dt><dd>${esc(item.region)} · ${esc(item.venue)}</dd></div><div><dt>모집자</dt><dd><button class="inline-button" data-action="view-profile" data-id="${esc(item.hostId)}">${esc(name(item.hostId))} · 매너 ${d.mannerFor(state, item.hostId).toFixed(1)} ↗</button></dd></div>${item.groupId ? `<div><dt>그룹</dt><dd>${esc(group(item.groupId).name)}</dd></div>` : ''}<div><dt>설명</dt><dd>${esc(item.description)}</dd></div></dl><div class="participant-block"><h3>확정 참가자</h3>${old.participants(item).map((id) => `<button class="person-pill" data-action="view-profile" data-id="${esc(id)}">${avatar(id)}${esc(name(id))} ↗</button>`).join('')}</div>${applicantRows}${result ? `<div class="result-note">${esc(resultSummary(result, item, me.id))}${result.attendedIds.length < old.participants(item).length ? ` · 참석 ${result.attendedIds.length}/${old.participants(item).length}명` : ''}</div>${resultReadback(result, item)}` : ''}${ratingBlock}<div class="modal-actions">${canApply ? `<button class="button primary" data-action="apply" data-id="${esc(item.id)}">참여 신청</button>` : ''}${canRecord ? `<button class="button primary" data-action="result" data-id="${esc(item.id)}">데모 결과 입력</button>` : ''}${canWithdraw ? `<button class="button outline" data-action="withdraw" data-id="${esc(item.id)}">신청·참가 철회</button>` : ''}${item.hostId === me.id && item.status === 'open' && !result ? `<button class="button outline danger" data-action="cancel-match" data-id="${esc(item.id)}">자리 취소</button>` : ''}<button class="button outline" data-action="close">닫기</button></div>`;
  return modalFrame(`${old.SPORT_LABEL[item.sport]} / MATCH DETAIL`, item.title, body, true);
}

function resultModal(item) {
  const people = old.participants(item);
  const attendance = `<fieldset class="attendance"><legend>실제 참가 여부</legend><p class="form-note">불참자는 프로필·랭킹·MVP·매너 평가에서 제외됩니다.</p>${people.map((id) => `<label><input type="checkbox" name="attended" value="${esc(id)}" checked>${esc(name(id))}</label>`).join('')}</fieldset>`;
  let fields = '';
  if (item.sport === 'tennis') fields = `<label class="no-contest"><input type="checkbox" name="noContest"> 인원 부족으로 경기 미성립 기록</label><fieldset><legend>팀 A (${item.format === 'doubles' ? '2명' : '1명'})</legend>${people.map((id, index) => `<label class="team-choice"><input type="checkbox" name="teamA" value="${esc(id)}" ${index < (item.format === 'doubles' ? 2 : 1) ? 'checked' : ''}>${esc(name(id))}</label>`).join('')}</fieldset><div class="form-grid"><label>팀 A 점수<input type="number" name="scoreA" min="0" max="99" value="6"></label><label>팀 B 점수<input type="number" name="scoreB" min="0" max="99" value="4"></label></div><p class="form-note">팀 B는 팀 A에 선택되지 않은 참석자로 구성됩니다. 승자와 상대 팀 패배를 스코어로 계산합니다.</p>`;
  else if (item.sport === 'futsal') fields = `<div class="form-grid"><label>우리 팀 득점<input type="number" name="scoreFor" min="0" max="99" value="2"></label><label>상대 팀 득점<input type="number" name="scoreAgainst" min="0" max="99" value="1"></label><label>MVP<select name="mvpUserId">${people.map((id) => `<option value="${esc(id)}">${esc(name(id))}</option>`).join('')}</select></label></div><div class="running-entries">${people.map((id) => `<fieldset><legend>${esc(name(id))}의 포지션</legend><label>포지션<input name="position-${esc(id)}" value="${esc(user(id).sports.futsal.preference)}" maxlength="30"></label></fieldset>`).join('')}</div><p class="form-note">모집된 참가자는 같은 팀입니다. 불참자는 MVP·경기 기록에서 제외됩니다.</p>`;
  else fields = `<div class="running-entries">${people.map((id) => `<fieldset><legend>${esc(name(id))}</legend><label>거리 (km)<input type="number" min="0.1" max="200" step="0.1" name="distance-${esc(id)}" value="5.0"></label><label>평균 페이스 (분:초 / km)<input type="text" inputmode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]" name="pace-${esc(id)}" value="05:40"></label><label>운동 후기<input name="review-${esc(id)}" maxlength="160" placeholder="오늘의 러닝은 어땠나요?"></label></fieldset>`).join('')}</div><p class="form-note">각 참석자의 거리·페이스·후기가 개별 기록으로 반영됩니다.</p>`;
  const body = `<p class="modal-intro">${esc(item.title)} · ${dateText(item.date)}<br>데모에서는 일정 날짜가 지나기 전에도 결과를 입력할 수 있습니다.</p><form id="result-form" data-id="${esc(item.id)}">${attendance}${fields}<div class="modal-actions"><button class="button outline" data-action="details" data-id="${esc(item.id)}" type="button">뒤로</button><button class="button primary" type="submit">결과 기록하기</button></div></form>`;
  return modalFrame('RECORD YOUR PLAY', `${old.SPORT_LABEL[item.sport]} 결과 입력`, body, true);
}

function profileModal(id, me) {
  const person = user(id); if (!person) return '';
  const friendship = d.friendsOf(state, me.id).includes(id);
  const hasPending = state.friendRequests.some((request) => [request.fromId, request.toId].includes(id) && [request.fromId, request.toId].includes(me.id) && request.status === 'pending');
  const body = `<div class="view-profile">${avatar(id, 'xl')}<p>${esc(person.region)} · ${esc(person.ageRange)} · 매너 ${d.mannerFor(state, id).toFixed(1)}</p><blockquote>${esc(person.bio)}</blockquote>${playCard(id, 'other')}<p class="muted">친구 코드: ${esc(person.friendCode)}</p>${person.chosenSports.map((sport) => `<div>${icon(sport)}<span><strong>${old.SPORT_LABEL[sport]} · ${esc(person.sports[sport].level)}</strong><small>${esc(person.sports[sport].experience)} · ${esc(person.sports[sport].preference)}${sport === 'tennis' ? ` · NTRP ${esc(person.sports.tennis.ntrp)}` : ''}<br>${esc(statLine(id, sport))}</small></span></div>`).join('')}</div><div class="modal-actions">${id !== me.id && !friendship && !hasPending ? `<button class="button primary" data-action="friend-direct" data-id="${esc(id)}">친구 신청</button>` : ''}${friendship ? `<button class="button primary" data-action="invite" data-id="${esc(id)}">운동 초대</button>` : ''}${hasPending ? '<span class="muted">친구 신청 대기 중</span>' : ''}<button class="button outline" data-action="close">닫기</button></div>`;
  return modalFrame('PLAYER PROFILE', person.name, body);
}
function inviteModal(targetId, me) {
  const available = state.matches.filter((item) => item.hostId === me.id && item.status === 'open' && !isDone(item) && !d.recruitmentClosed(item) && old.openSeats(item) && d.canViewMatch(state, item, targetId) && !item.applications.some((a) => a.userId === targetId) && !state.invitations.some((invite) => invite.toId === targetId && invite.matchId === item.id && invite.status === 'pending'));
  const body = `<p class="modal-intro">${esc(name(targetId))}님을 내가 모집하는 운동으로 초대합니다. 초대를 수락하면 일정에 바로 등록됩니다.</p>${available.length ? `<form id="invite-form" data-target="${esc(targetId)}"><label>운동 자리<select name="matchId">${available.map((item) => `<option value="${esc(item.id)}">${esc(item.title)} · ${dateText(item.date)}</option>`).join('')}</select></label><div class="modal-actions"><button class="button outline" type="button" data-action="close">취소</button><button class="button primary" type="submit">초대 보내기</button></div></form>` : '<div class="empty">초대할 수 있는 내 자리가 없어요. 새 자리를 만든 뒤 다시 초대해 주세요.</div><div class="modal-actions"><button class="button primary" data-action="create">운동 자리 만들기</button></div>'}`;
  return modalFrame('PLAY TOGETHER', '운동 초대', body);
}
function cardModal() {
  const body = `<p class="modal-intro">${modal.kind === 'today' ? '작성 중인 한 줄을 포함한 미리보기입니다. 기록에 남기려면 홈에서 저장해 주세요.' : '저장된 프로필로 만든 미리보기입니다. 편집 중인 내용은 프로필 저장 후 반영됩니다.'}</p><img class="card-preview" src="${esc(cardUrl)}" alt="DWNC ${modal.kind === 'today' ? '오늘 운동' : '프로필'} 카드 미리보기"><div class="modal-actions"><a class="button primary" href="${esc(cardUrl)}" download="dwnc-${modal.kind}-${today()}.png">PNG 다운로드</a><button class="button outline" data-action="close">닫기</button></div>`;
  return modalFrame('YOUR PLAY CARD', modal.kind === 'today' ? '오늘 운동 카드' : '프로필 카드', body, true);
}
function cardLoadingModal() {
  return modalFrame('YOUR PLAY CARD', '카드 만드는 중', '<p class="modal-intro" role="status">사진과 운동 기록을 카드에 담고 있어요. 잠시만 기다려 주세요.</p><div class="modal-actions"><button class="button outline" data-action="close">취소</button></div>');
}
function cancelConfirmModal(item) {
  return modalFrame('CANCEL MATCH', '운동 자리 취소', `<p class="modal-intro"><strong>${esc(item.title)}</strong> 자리를 취소할까요? 확정 참가자와 대기 중인 신청자에게 앱 알림이 갑니다. 완료된 운동은 취소할 수 없습니다.</p><div class="modal-actions"><button class="button outline" data-action="close">취소 유지</button><button class="button outline danger" data-action="confirm-cancel" data-id="${esc(item.id)}">취소 확정</button></div>`);
}

function resetConfirmModal() {
  return modalFrame('DEMO DATA', '예시 데이터로 다시 시작', `<p class="modal-intro">이 브라우저에 저장된 데모 기록, 사진, 새로 만든 인물과 그룹이 모두 지워지고 <strong>${dateText(today())}</strong> 기준 예시 데이터로 돌아갑니다. 되돌릴 수 없습니다.</p><div class="modal-actions"><button class="button outline" data-action="close">그대로 두기</button><button class="button outline danger" data-action="reset-storage">초기화</button></div>`);
}

function render() {
  if (corrupt) {
    root.innerHTML = `<main class="recovery"><div><span class="logo-mark">DWNC✳</span><h1>저장된 데모 데이터를 읽을 수 없어요.</h1><p>이 브라우저의 데이터가 손상됐습니다. 자동 초기화하지 않았습니다. 새 예시 데이터로 시작하면 기존 로컬 데모 데이터가 제거됩니다.</p><button class="button primary" data-action="reset-storage">예시 데이터로 다시 시작</button></div></main>`;
    return;
  }
  const me = user(state.activeUserId);
  const page = route();
  const pageViews = { home: homePage, matches: matchesPage, activity: activityPage, people: peoplePage, groups: groupsPage, profile: profilePage, ranking: rankingPage, notifications: notificationsPage };
  const unread = state.notifications.filter((item) => item.userId === me.id && !item.read).length;
  const modalContent = modal ? modal.type === 'create' ? createModal(me, modal.groupId) : modal.type === 'details' ? detailModal(match(modal.id), me) : modal.type === 'result' ? resultModal(match(modal.id)) : modal.type === 'profile' ? profileModal(modal.id, me) : modal.type === 'invite' ? inviteModal(modal.id, me) : modal.type === 'group-create' ? groupCreateModal(me) : modal.type === 'group-detail' ? groupDetailModal(group(modal.id), me) : modal.type === 'onboard' ? onboardingModal() : modal.type === 'cancel-confirm' ? cancelConfirmModal(match(modal.id)) : modal.type === 'card-loading' ? cardLoadingModal() : modal.type === 'reset-confirm' ? resetConfirmModal() : cardModal() : '';
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><a href="#/home" class="brand">DWNC<span>✳</span></a><div class="sidebar-mid"><p class="eyebrow">YOUR PLAYGROUND</p><nav aria-label="주 메뉴">${navLink('home', '홈', '⌂')}${navLink('matches', '매칭 찾기', '◎')}${navLink('activity', '내 운동', '◷')}${navLink('people', '친구와 사람들', '♧')}${navLink('groups', '그룹', '✳')}${navLink('profile', '프로필', '♙')}${navLink('ranking', '지역 랭킹', '↗')}${navLink('notifications', `알림 ${unread ? unread : ''}`, '♢')}</nav></div><div class="sidebar-user">${avatar(me.id)}<span><strong>${esc(me.name)}</strong><small>${esc(me.region)} · 로컬 데모</small></span></div></aside><div class="app-content"><header class="topbar"><div class="topbar-left"><span class="demo-chip">기기 안의 데모 데이터</span><span>${dateText(today())} · ${esc(me.region)}</span></div><div class="topbar-right"><button class="top-link" data-action="onboard">＋ 새 사용자</button><a href="#/profile" class="top-icon" title="프로필" aria-label="프로필">♙<span>프로필</span></a><a href="#/ranking" class="top-icon" title="랭킹" aria-label="랭킹">↗<span>랭킹</span></a><a href="#/notifications" class="top-icon" title="알림" aria-label="알림">♢<span>알림</span>${unread ? `<b>${unread}</b>` : ''}</a><label class="user-picker">데모 사용자 전환 <select id="user-switch" aria-label="데모 사용자 전환">${state.users.map((person) => `<option value="${esc(person.id)}" ${person.id === me.id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></label></div></header>${storageMode === 'memory' ? '<div class="storage-warning" role="status">브라우저 저장을 사용할 수 없습니다. 변경은 현재 탭에서만 유지됩니다.</div>' : ''}${conflict ? '<div class="storage-warning conflict" role="alert">다른 탭에서 데모 데이터가 변경됐습니다. 덮어쓰지 않도록 편집을 멈췄습니다. <button data-action="reload-state">최신 데이터 불러오기</button></div>' : ''}<div class="page-content">${pageViews[page](me)}</div></div></div><nav class="mobile-nav" aria-label="모바일 주 메뉴">${navLink('home', '홈', '⌂')}${navLink('matches', '매칭', '◎')}${navLink('activity', '내 운동', '◷')}${navLink('people', '친구', '♧')}${navLink('groups', '그룹', '✳')}</nav><div id="feedback" class="feedback ${flash?.error ? 'error' : 'success'}" role="status" ${flash ? '' : 'hidden'}>${flash ? esc(flash.text) : ''}</div>${modalContent ? `<div class="modal-backdrop" data-action="close"><div class="modal-wrap">${modalContent}</div></div>` : ''}`;
  flash = null;
  restoreDrafts();
  document.body.classList.toggle('dialog-open', Boolean(modalContent));
  root.querySelector('.app-shell').inert = Boolean(modalContent);
  root.querySelector('.mobile-nav').inert = Boolean(modalContent);
  if (modalContent) root.querySelector('[role="dialog"]')?.focus({ preventScroll: true });
  document.title = `DWNC · ${{ home: '홈', matches: '매칭 찾기', activity: '내 운동', people: '친구와 사람들', groups: '그룹', profile: '프로필', ranking: '지역 랭킹', notifications: '알림' }[page]}`;
}

function setCreateControls() {
  const sport = root.querySelector('#create-sport')?.value;
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
  if (action === 'close' && button.classList.contains('modal-backdrop') && event.target !== button) return;
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
    else if (action === 'join-group') { modal = null; save(d.joinGroup(state, id, state.activeUserId), '그룹에 가입했습니다.'); }
    else if (action === 'details') { if (modal?.type === 'result') closeModal(); else openModal({ type: 'details', id }, button); }
    else if (action === 'result') { openModal({ type: 'result', id }, button); }
    else if (action === 'view-profile') { openModal({ type: 'profile', id }, button); }
    else if (action === 'invite') { openModal({ type: 'invite', id }, button); }
    else if (action === 'apply') { modal = null; save(d.requestMatch(state, id, state.activeUserId), '참여 신청을 보냈습니다.'); }
    else if (action === 'decide') { modal = { type: 'details', id }; save(d.decideMatchRequest(state, id, state.activeUserId, userId, decision), decision === 'accepted' ? '신청을 수락했습니다.' : '신청을 거절했습니다.'); }
    else if (action === 'withdraw') { modal = null; save(d.withdrawMatch(state, id, state.activeUserId), '신청 또는 참가를 철회했습니다.'); }
    else if (action === 'cancel-match') { openModal({ type: 'cancel-confirm', id }, button); }
    else if (action === 'confirm-cancel') { modal = null; save(d.cancelMatch(state, id, state.activeUserId), '운동 자리를 취소했습니다.'); }
    else if (action === 'friend-decide') save(d.decideFriendRequest(state, id, state.activeUserId, decision), decision === 'accepted' ? '친구가 됐습니다.' : '친구 신청을 거절했습니다.');
    else if (action === 'friend-direct') { const target = user(id); modal = null; save(d.sendFriendRequest(state, state.activeUserId, target.friendCode), '친구 신청을 보냈습니다.'); }
    else if (action === 'invite-decide') save(d.decideInvitation(state, id, state.activeUserId, decision), decision === 'accepted' ? '초대를 수락하고 일정에 등록했습니다.' : '초대를 거절했습니다.');
    else if (action === 'filter-sport') { const form = root.querySelector('#filter-form'); const data = new FormData(form); filters = { ...Object.fromEntries(data), openOnly: data.has('openOnly'), sport: id, format: '' }; advancedFiltersOpen = form.querySelector('details').open; render(); }
    else if (action === 'reset-filters') { advancedFiltersOpen = false; filters = { sport: '', format: '', region: '', venue: '', date: '', time: '', level: '', query: '', openOnly: true, minOpenSeats: '' }; render(); }
    else if (action === 'remove-photo') save(d.setProfilePhoto(state, state.activeUserId, null), '프로필 사진을 제거했습니다.');
    else if (action === 'read-all') save(d.markAllNoticesRead(state, state.activeUserId), '모든 알림을 읽었습니다.');
    else if (action === 'open-notice') { const notice = state.notifications.find((item) => item.id === id && item.userId === state.activeUserId); if (!notice) throw new old.DomainError('알림을 찾을 수 없습니다.'); save(d.markNoticeRead(state, id, state.activeUserId), '알림을 읽었습니다.'); location.hash = notice.route; routeModal(); render(); }
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
    else if (action === 'reset-storage') { modal = null; modalStack.length = 0; drafts.clear(); rankFilter = { ...rankFilter, month: today().slice(0, 7) }; if (location.hash !== '#/home') history.replaceState(null, '', '#/home'); try { localStorage.removeItem(old.STORAGE_KEY); savedRaw = null; } catch { storageMode = 'memory'; } corrupt = false; state = d.createExtendedSeed(); save(state, '예시 데이터로 다시 시작했습니다.'); }
  } catch (error) { if (exportRequestId !== null && exportRequestId !== cardRequestId) return; if (action === 'export-card' && modal?.type === 'card-loading') { modal = null; render(); } feedback(error.message || '작업을 완료하지 못했습니다.'); }
});

root.addEventListener('change', async (event) => {
  const target = event.target;
  cardRequestId++;
  try {
    if (target.id === 'user-switch') { modalStack.length = 0; modal = null; save(d.switchDemoUser(state, target.value), `${name(target.value)}님으로 전환했습니다.`); }
    if (target.name === 'chosenSports') syncProfileSports();
    if (target.id === 'create-sport') setCreateControls();
    if (target.id === 'create-format') { const capacity = root.querySelector('#create-capacity'); if (capacity) capacity.value = target.value === 'doubles' ? 4 : 2; }
    if (target.id === 'create-visibility') setCreateVisibility();
    if (target.id === 'profile-photo' && target.files?.[0]) { const ownerId = state.activeUserId; const url = await makePhoto(target.files[0]); if (state.activeUserId !== ownerId) return; save(d.setProfilePhoto(state, ownerId, url), '프로필 사진을 저장했습니다.'); }
  } catch (error) { feedback(error.message || '변경을 완료하지 못했습니다.'); }
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target, formData = new FormData(form), values = Object.fromEntries(formData);
  submittedForm = form;
  try {
    if (form.id === 'filter-form') { advancedFiltersOpen = form.querySelector('details')?.open || false; filters = { ...values, openOnly: formData.has('openOnly') }; render(); return; }
    if (form.id === 'ranking-form') { rankFilter = values; render(); return; }
    if (form.id === 'note-form') { save(d.setDailyNote(state, state.activeUserId, today(), values.note), '오늘의 한 줄을 저장했습니다.'); return; }
    if (form.id === 'friend-form') { save(d.sendFriendRequest(state, state.activeUserId, values.code), '친구 신청을 보냈습니다.'); return; }
    if (form.id === 'group-form') { const created = d.createGroup(state, state.activeUserId, values); modal = null; save(created.state, '그룹을 만들었습니다.'); return; }
    if (form.id === 'onboarding-form') { const created = d.createDemoUser(state, { ...values, chosenSports: formData.getAll('chosenSports') }); modal = null; save(created.state, '새 데모 사용자를 만들었습니다. 종목별 세부 정보를 프로필에서 채워 주세요.'); location.hash = '#/profile'; return; }
    if (form.id === 'create-form') { const created = d.makeMatch(state, state.activeUserId, values); modal = null; save(created.state, '운동 자리를 만들었습니다.'); location.hash = '#/activity'; return; }
    if (form.id === 'profile-form') {
      const sports = Object.fromEntries(formData.getAll('chosenSports').map((sport) => [sport, { experience: values[`${sport}-experience`], level: values[`${sport}-level`], preference: values[`${sport}-preference`], ...(sport === 'tennis' ? { ntrp: values['tennis-ntrp'] } : {}) }]));
      save(d.editProfile(state, state.activeUserId, { ...values, chosenSports: formData.getAll('chosenSports'), sports }), '프로필을 저장했습니다.'); return;
    }
    if (form.id === 'invite-form') { modal = null; save(d.inviteToMatch(state, values.matchId, state.activeUserId, form.dataset.target), '운동 초대를 보냈습니다.'); return; }
    if (form.id === 'result-form') {
      const item = match(form.dataset.id), attendedIds = formData.getAll('attended');
      let payload = { attendedIds };
      if (item.sport === 'tennis') payload = { ...payload, noContest: formData.has('noContest'), teamAIds: formData.getAll('teamA'), scoreA: values.scoreA, scoreB: values.scoreB };
      else if (item.sport === 'futsal') payload = { ...payload, scoreFor: values.scoreFor, scoreAgainst: values.scoreAgainst, mvpUserId: values.mvpUserId, positions: Object.fromEntries(old.participants(item).map((id) => [id, values[`position-${id}`]])) };
      else payload = { ...payload, entries: Object.fromEntries(attendedIds.map((id) => { const [minute, second] = String(values[`pace-${id}`] || '').split(':').map(Number); return [id, { distanceKm: values[`distance-${id}`], paceSec: minute * 60 + second }]; })), reviews: Object.fromEntries(attendedIds.map((id) => [id, values[`review-${id}`]])) };
      const next = d.saveResult(state, item.id, state.activeUserId, payload); modal = null; save(next, '운동 결과와 기록이 반영됐습니다.'); return;
    }
    if (form.classList.contains('rate-form')) { const next = d.rateParticipant(state, form.dataset.match, state.activeUserId, form.dataset.target, values.value); modal = { type: 'details', id: form.dataset.match }; save(next, '동료 평가를 남겼습니다.'); }
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
