import { SPORTS, SPORT_LABEL, LEVELS, STORAGE_KEY, createSeed, validateState, today, getUser, getMatch, participants, openSeats, isCompleted, switchUser, updateProfile, createMatch, applyToMatch, decideApplication, recordResult, activityFor, statsFor, ranking, filterMatches } from './domain.js';

const root = document.getElementById('app');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dateText = (date) => { const [year, month, day] = date.split('-').map(Number); return `${month}월 ${day}일 (${['일', '월', '화', '수', '목', '금', '토'][new Date(year, month - 1, day).getDay()]})`; };
const paceText = (seconds) => seconds ? `${Math.floor(seconds / 60)}′${String(seconds % 60).padStart(2, '0')}″` : '—';
const initials = (name) => esc(String(name || '?').slice(-1));
const options = (values, selected, placeholder = '') => `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${values.map((value) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
const sportOptions = (selected, placeholder = '전체 종목') => `${placeholder ? `<option value="">${placeholder}</option>` : ''}${SPORTS.map((sport) => `<option value="${sport}" ${selected === sport ? 'selected' : ''}>${SPORT_LABEL[sport]}</option>`).join('')}`;
const statusText = { pending: '신청 대기', accepted: '참가 확정', rejected: '신청 거절' };
const icons = { tennis: '◎', futsal: '✳', running: '↗' };
let state, storageMode = 'saved', corrupt = false, modal = null, flash = null;
let filters = { sport: '', region: '', venue: '', date: '', time: '', level: '', query: '', openOnly: true };
let rankingFilters = { sport: 'tennis', region: '', venue: '' };

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { const parsed = JSON.parse(raw); if (!validateState(parsed)) corrupt = true; else state = parsed; }
  else state = createSeed();
} catch (error) {
  if (error instanceof SyntaxError) corrupt = true;
  else { storageMode = 'memory'; state = createSeed(); }
}

function save(next, success) {
  if (storageMode === 'saved') {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { storageMode = 'memory'; }
  }
  state = next;
  flash = { text: storageMode === 'saved' ? success : `${success} · 브라우저 저장 불가: 이 탭에서만 유지됩니다.`, error: storageMode !== 'saved' };
  render();
}
function feedback(message, error = true) {
  const node = document.getElementById('feedback');
  if (node) { node.textContent = message; node.className = `feedback ${error ? 'error' : 'success'}`; node.hidden = false; node.scrollIntoView({ block: 'nearest' }); }
}
function route() { const name = location.hash.replace(/^#\//, '').split('?')[0]; return ['home', 'matches', 'activity', 'profile', 'ranking'].includes(name) ? name : 'home'; }
function navLink(page, label, symbol) { return `<a href="#/${page}" class="${route() === page ? 'active' : ''}" ${route() === page ? 'aria-current="page"' : ''}><span aria-hidden="true">${symbol}</span>${label}</a>`; }
function userName(id) { return getUser(state, id)?.name || '알 수 없음'; }
function myStatus(match) { return match.hostId === state.activeUserId ? 'host' : match.applications.find((a) => a.userId === state.activeUserId)?.status || ''; }
function badge(match) {
  if (isCompleted(state, match.id)) return '<span class="badge done">운동 완료</span>';
  const status = myStatus(match);
  if (status === 'host') return '<span class="badge host">내가 모집</span>';
  if (status) return `<span class="badge ${status}">${statusText[status]}</span>`;
  return openSeats(match) ? `<span class="badge open">${openSeats(match)}자리 남음</span>` : '<span class="badge full">모집 마감</span>';
}
function icon(sport, className = '') { return `<span class="sport-icon ${sport} ${className}" aria-hidden="true">${icons[sport]}</span>`; }
function matchCard(match, compact = false) {
  return `<article class="match-card ${compact ? 'compact' : ''}"><div class="match-card__top">${icon(match.sport)}<span class="sport-name">${SPORT_LABEL[match.sport]}</span>${badge(match)}</div><h3>${esc(match.title)}</h3><p>${dateText(match.date)} ${esc(match.startTime)}–${esc(match.endTime)}<br>${esc(match.region)} · ${esc(match.venue)}</p><div class="match-card__foot"><span>${participants(match).length} / ${match.capacity}명 · ${esc(match.level)}</span><button type="button" data-action="details" data-id="${esc(match.id)}" class="text-link">자세히 보기 <span aria-hidden="true">↗</span></button></div></article>`;
}
function statNumber(userId, sport) {
  const stats = statsFor(state, userId);
  return sport === 'tennis' ? `${stats.tennis.wins}승 ${stats.tennis.losses}패` : sport === 'futsal' ? `${stats.futsal.games}경기 · MVP ${stats.futsal.mvp}` : `${stats.running.distanceKm}km · ${paceText(stats.running.paceSec)}/km`;
}
function pageHome(user) {
  const items = activityFor(state, user.id);
  const suggestions = filterMatches(state, { openOnly: true, region: user.region }).filter((match) => match.hostId !== user.id && !match.applications.some((a) => a.userId === user.id)).slice(0, 3);
  const stats = statsFor(state, user.id);
  return `<div class="home-layout"><div class="home-main"><section class="hero"><div class="hero-copy"><p class="eyebrow">MOVE WITH SOMEONE</p><h1>오늘도, 같이<br><em>움직여볼까요?</em></h1><p>한 사람의 여러 운동이 이어지는 곳.<br>${esc(user.name)}님의 다음 움직임을 만나보세요.</p><div class="hero-actions"><a href="#/matches" class="button primary">내 주변 매칭 보기 <span>↗</span></a><button class="button ghost" data-action="create">운동 자리 만들기 <span>＋</span></button></div></div><div class="hero-art" aria-hidden="true"><div class="orbit outer"></div><div class="orbit inner"></div><div class="hero-ball"></div><span>PLAY<br>MORE.</span></div></section><div class="section-heading"><div><span class="eyebrow">01 / TODAY</span><h2>오늘의 움직임</h2></div><a href="#/activity" class="text-link">내 운동 전체 보기 ↗</a></div><div class="today-grid">${items.length ? items.map(({ match, result }) => `<article class="today-card ${match.sport}"><div class="today-card__top"><span class="badge ${result ? 'done' : 'upcoming'}">${result ? '완료' : '예정'}</span><b>${esc(match.startTime)}</b></div><div class="today-card__bottom">${icon(match.sport)}<div><small>${SPORT_LABEL[match.sport]} · ${esc(match.venue)}</small><strong>${esc(match.title)}</strong><p>${result ? esc(resultSummary(result, match, user.id)) : `${esc(userName(match.hostId))}님과 함께 · ${participants(match).length}명 확정`}</p></div></div></article>`).join('') : '<div class="empty">오늘 예정된 운동이 없어요. 새로운 자리를 찾아보세요.</div>'}</div><div class="section-heading spaced"><div><span class="eyebrow">02 / AROUND YOU</span><h2>가까운 곳에서, 함께</h2></div><a href="#/matches" class="text-link">모든 매칭 보기 ↗</a></div><div class="match-grid">${suggestions.length ? suggestions.map((match) => matchCard(match, true)).join('') : '<div class="empty">지금 신청 가능한 주변 자리가 없어요. 직접 만들어 보세요.</div>'}</div></div><aside class="home-rail"><div class="rail-top"><span class="eyebrow">MY PLAY CARD</span><a href="#/profile" aria-label="프로필 보기">↗</a></div><div class="avatar large">${initials(user.name)}</div><small>운동하는 사람, ${esc(user.name)}</small><h3>종목은 달라도<br>움직이는 마음은 하나.</h3><div class="rail-sports">${SPORTS.map((sport) => `<div><span>${SPORT_LABEL[sport]}</span><b>${esc(user.sports[sport].level)}</b></div>`).join('')}</div><div class="rail-stats"><div><strong>${state.results.filter((r) => participants(getMatch(state, r.matchId)).includes(user.id)).length}</strong><small>함께한 운동</small></div><div><strong>${user.manner.toFixed(1)}</strong><small>매너 지수 · 데모</small></div></div><div class="rail-note"><span>✳</span><p>좋아하는 운동은<br><strong>함께할 때 더 커지니까.</strong></p><small>DWNC / OUR COMMUNITY</small></div><p class="rail-foot">테니스 ${stats.tennis.winRate}% 승률 · 러닝 ${stats.running.distanceKm}km</p></aside></div>`;
}
function resultSummary(result, match, userId) {
  if (match.sport === 'tennis') return !participants(match).includes(userId) ? `${userName(result.winnerId)}님 승리` : result.winnerId === userId ? '승리 기록' : '참가 · 패배 기록';
  if (match.sport === 'futsal') return `우리 팀 ${result.teamOutcome === 'win' ? '승' : result.teamOutcome === 'loss' ? '패' : '무'} ${result.scoreFor}:${result.scoreAgainst}${result.mvpUserId === userId ? ' · MVP' : ''}`;
  const entry = result.entries[userId]; return entry ? `${entry.distanceKm}km · ${paceText(entry.paceSec)}/km` : '러닝 완료';
}
function pageMatches() {
  const regions = [...new Set(state.matches.map((match) => match.region))].sort();
  const matches = filterMatches(state, filters);
  return `<div class="page-head"><div><span class="eyebrow">FIND YOUR PEOPLE</span><h1>운동 매칭 찾기</h1><p>종목과 장소를 고르고, 함께할 자리를 찾아보세요.</p></div><button type="button" class="button primary" data-action="create">＋ 운동 자리 만들기</button></div><form id="filter-form" class="filter-panel"><label>종목<select name="sport">${sportOptions(filters.sport)}</select></label><label>지역<select name="region">${options(regions, filters.region, '전체 지역')}</select></label><label>장소<input name="venue" value="${esc(filters.venue)}" placeholder="구장·공원"></label><label>날짜<input type="date" name="date" value="${esc(filters.date)}"></label><label>시간대<select name="time"><option value="">전체 시간</option><option value="morning" ${filters.time === 'morning' ? 'selected' : ''}>오전</option><option value="afternoon" ${filters.time === 'afternoon' ? 'selected' : ''}>오후</option><option value="evening" ${filters.time === 'evening' ? 'selected' : ''}>저녁</option></select></label><label>수준<select name="level">${options(LEVELS, filters.level, '모든 수준')}</select></label><label class="search-field">검색<input name="query" value="${esc(filters.query)}" placeholder="제목·설명 검색"></label><label class="check-field"><input type="checkbox" name="openOnly" ${filters.openOnly ? 'checked' : ''}> 신청 가능만 보기</label><div class="filter-actions"><button class="button primary" type="submit">조건 적용</button><button class="button outline" type="button" data-action="reset-filters">초기화</button></div></form><div class="list-heading"><h2>매칭 목록 <span>${matches.length}</span></h2><span>모집자와 수락된 참가자의 기록을 확인할 수 있어요.</span></div><div class="match-grid full">${matches.length ? matches.map((match) => matchCard(match)).join('') : '<div class="empty">조건에 맞는 운동 자리가 없어요. 필터를 초기화하거나 새 자리를 만들어 보세요.</div>'}</div>`;
}
function pageActivity(user) {
  const mine = state.matches.filter((match) => match.hostId === user.id || match.applications.some((a) => a.userId === user.id)).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const pending = mine.filter((match) => match.hostId === user.id && match.applications.some((a) => a.status === 'pending'));
  return `<div class="page-head"><div><span class="eyebrow">MY MOVEMENT</span><h1>내 운동</h1><p>오늘의 기록과 확정된 일정, 신청 상태를 한눈에 확인하세요.</p></div><button class="button primary" type="button" data-action="create">＋ 새 운동 자리</button></div><div class="activity-summary"><div><strong>${activityFor(state, user.id).length}</strong><span>오늘 운동</span></div><div><strong>${mine.filter((match) => !isCompleted(state, match.id) && (match.hostId === user.id || myStatus(match) === 'accepted')).length}</strong><span>예정 일정</span></div><div><strong>${pending.reduce((sum, match) => sum + match.applications.filter((a) => a.status === 'pending').length, 0)}</strong><span>응답할 신청</span></div></div><div class="section-heading"><div><span class="eyebrow">SCHEDULE & HISTORY</span><h2>내 자리와 신청</h2></div></div><div class="activity-list">${mine.length ? mine.map((match) => `<article class="activity-row">${icon(match.sport)}<div class="activity-row__body"><div class="activity-row__title">${esc(match.title)} ${badge(match)}</div><p>${dateText(match.date)} ${esc(match.startTime)} · ${esc(match.venue)} · ${SPORT_LABEL[match.sport]}</p><small>${isCompleted(state, match.id) ? esc(resultSummary(state.results.find((r) => r.matchId === match.id), match, user.id)) : match.hostId === user.id ? `${match.applications.filter((a) => a.status === 'pending').length}명 신청 대기` : statusText[myStatus(match)] || ''}</small></div><button class="button outline small" data-action="details" data-id="${esc(match.id)}">상세 보기</button></article>`).join('') : '<div class="empty">아직 참여한 운동이 없어요. 매칭에서 첫 자리를 찾아보세요.</div>'}</div>`;
}
function pageProfile(user) {
  const stats = statsFor(state, user.id);
  const sportStats = { tennis: `${stats.tennis.games}경기 · ${stats.tennis.wins}승 ${stats.tennis.losses}패 · 승률 ${stats.tennis.winRate}%`, futsal: `${stats.futsal.games}경기 · ${stats.futsal.wins}승 ${stats.futsal.losses}패 ${stats.futsal.draws}무 · MVP ${stats.futsal.mvp}회`, running: `${stats.running.runs}회 · 누적 ${stats.running.distanceKm}km · 평균 ${paceText(stats.running.paceSec)}/km` };
  return `<div class="page-head"><div><span class="eyebrow">MY PLAY CARD</span><h1>멀티 스포츠 프로필</h1><p>운동 전에는 서로를 알고, 운동 후에는 기록이 쌓입니다.</p></div></div><div class="profile-layout"><section class="profile-card"><div class="profile-cover"><span>✳</span><b>MOVE TOGETHER.</b></div><div class="profile-identity"><div class="avatar xl">${initials(user.name)}</div><h2>${esc(user.name)}</h2><p>${esc(user.region)} · ${esc(user.ageRange)} · ${esc(user.gender || '미입력')}</p><span class="badge open">매너 ${user.manner.toFixed(1)} · 예시 지수</span></div><blockquote>${esc(user.bio || '자기소개를 작성해 보세요.')}</blockquote><div class="profile-sport-list">${SPORTS.map((sport) => `<div>${icon(sport)}<span><strong>${SPORT_LABEL[sport]}</strong><small>${esc(user.sports[sport].experience)} · ${esc(user.sports[sport].preference)}${sport === 'tennis' ? ` · NTRP ${esc(user.sports.tennis.ntrp)}` : ''}</small></span><b>${esc(user.sports[sport].level)}</b></div>`).join('')}</div></section><div class="profile-main"><section class="panel"><div class="panel-head"><div><span class="eyebrow">EDIT YOUR CARD</span><h2>프로필 관리</h2></div></div><form id="profile-form"><div class="form-grid"><label>이름<input name="name" required maxlength="24" value="${esc(user.name)}"></label><label>활동 지역<input name="region" required maxlength="30" value="${esc(user.region)}"></label><label>연령대<input name="ageRange" required value="${esc(user.ageRange)}" placeholder="예: 20대"></label><label>성별<select name="gender">${options(['미입력', '여성', '남성', '기타'], user.gender)}</select></label><label class="wide">자기소개<textarea name="bio" maxlength="180" rows="2">${esc(user.bio)}</textarea></label></div><div class="sport-edit-grid">${SPORTS.map((sport) => `<fieldset><legend>${icons[sport]} ${SPORT_LABEL[sport]}</legend><label>운동 경력<input name="${sport}-experience" required value="${esc(user.sports[sport].experience)}" placeholder="예: 2년"></label><label>수준<select name="${sport}-level">${options(LEVELS, user.sports[sport].level)}</select></label><label>${sport === 'tennis' ? '선호 경기 방식' : sport === 'futsal' ? '선호 포지션' : '선호 거리'}<input name="${sport}-preference" required value="${esc(user.sports[sport].preference)}"></label>${sport === 'tennis' ? `<label>NTRP <small>(1.0–7.0, 0.5 단위)</small><input name="tennis-ntrp" type="number" min="1" max="7" step="0.5" required value="${esc(user.sports.tennis.ntrp)}"></label>` : ''}</fieldset>`).join('')}</div><button class="button primary" type="submit">프로필 저장</button></form></section><section class="panel"><div class="panel-head"><div><span class="eyebrow">TRACK YOUR PLAY</span><h2>운동 기록</h2></div><span class="hint">결과를 입력하면 자동 반영</span></div><div class="record-list">${SPORTS.map((sport) => `<div>${icon(sport)}<strong>${SPORT_LABEL[sport]}</strong><span>${sportStats[sport]}</span></div>`).join('')}</div></section></div></div>`;
}
function pageRanking(user) {
  const regions = [...new Set(state.matches.map((m) => m.region))].sort();
  const rows = ranking(state, rankingFilters.sport, { region: rankingFilters.region, venue: rankingFilters.venue });
  const metric = (stats) => rankingFilters.sport === 'tennis' ? `${stats.tennis.winRate}% <small>${stats.tennis.games}경기</small>` : rankingFilters.sport === 'futsal' ? `MVP ${stats.futsal.mvp} <small>${stats.futsal.games}경기</small>` : `${paceText(stats.running.paceSec)}/km <small>${stats.running.distanceKm}km</small>`;
  return `<div class="page-head"><div><span class="eyebrow">LOCAL PLAYERS</span><h1>지역·장소 랭킹</h1><p>해당 지역 또는 장소에서 실제로 기록된 운동만 집계합니다.</p></div></div><div class="ranking-intro"><span>✳</span><p>함께 움직인 기록이<br><strong>우리 동네의 이야기가 됩니다.</strong></p></div><form id="ranking-form" class="ranking-filters"><label>종목<select name="sport">${sportOptions(rankingFilters.sport, '')}</select></label><label>지역<select name="region">${options(regions, rankingFilters.region, '전체 지역')}</select></label><label>장소<input name="venue" value="${esc(rankingFilters.venue)}" placeholder="전체 장소"></label><button class="button primary" type="submit">랭킹 보기</button></form><div class="panel rank-panel"><div class="panel-head"><div><span class="eyebrow">${SPORT_LABEL[rankingFilters.sport].toUpperCase()} / LEADERBOARD</span><h2>${rankingFilters.region ? esc(rankingFilters.region) : '전체 지역'} ${rankingFilters.venue ? `· ${esc(rankingFilters.venue)}` : ''}</h2></div><span class="hint">활동 기록이 없는 사용자는 제외</span></div>${rows.length ? `<div class="ranking-list">${rows.map(({ user: rowUser, stats }, index) => `<button type="button" data-action="view-profile" data-id="${esc(rowUser.id)}" class="rank-row"><b class="rank-num">${String(index + 1).padStart(2, '0')}</b><span class="avatar">${initials(rowUser.name)}</span><span class="rank-person"><strong>${esc(rowUser.name)} ${rowUser.id === user.id ? '<em>나</em>' : ''}</strong><small>${esc(rowUser.region)} · ${esc(rowUser.sports[rankingFilters.sport].level)}</small></span><span class="rank-metric">${metric(stats)}</span><span class="rank-arrow">↗</span></button>`).join('')}</div>` : '<div class="empty">선택한 범위의 운동 기록이 없어요. 다른 지역이나 장소를 선택해 보세요.</div>'}</div>`;
}
function createModal(user) {
  return `<div class="modal-card wide-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-head"><div><span class="eyebrow">HOST A PLAY</span><h2 id="modal-title">운동 자리 만들기</h2></div><button type="button" data-action="close" class="close" aria-label="닫기">×</button></div><p class="modal-intro">모집자 ${esc(user.name)}님이 직접 여는 공개 데모 자리입니다.</p><form id="create-form"><div class="form-grid"><label>종목<select name="sport" required>${sportOptions('tennis', '')}</select></label><label>제목<input name="title" maxlength="60" required placeholder="함께할 운동을 소개해 주세요"></label><label>지역<input name="region" maxlength="30" required value="${esc(user.region)}"></label><label>장소<input name="venue" maxlength="60" required placeholder="구장 또는 공원 이름"></label><label>날짜<input type="date" name="date" required min="${today()}" value="${today()}"></label><label>시작 시간<input type="time" name="startTime" required value="19:00"></label><label>종료 시간<input type="time" name="endTime" required value="20:00"></label><label>정원 <small>(테니스 단식은 2명)</small><input type="number" name="capacity" min="2" max="20" required value="2"></label><label>필요 수준<select name="level">${options(LEVELS, '무관')}</select></label><label class="wide">모집 설명<textarea name="description" required maxlength="500" rows="3" placeholder="어떤 운동을 함께할지 적어 주세요"></textarea></label></div><div class="modal-actions"><button type="button" class="button outline" data-action="close">취소</button><button type="submit" class="button primary">자리 등록</button></div></form></div>`;
}
function detailsModal(match) {
  const host = getUser(state, match.hostId); const status = myStatus(match); const completed = isCompleted(state, match.id);
  const canApply = !completed && match.hostId !== state.activeUserId && !status && openSeats(match) > 0;
  const canResult = !completed && participants(match).includes(state.activeUserId) && participants(match).length >= 2;
  return `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-head"><div><span class="eyebrow">${SPORT_LABEL[match.sport]} / MATCH DETAIL</span><h2 id="modal-title">${esc(match.title)}</h2></div><button type="button" data-action="close" class="close" aria-label="닫기">×</button></div><div class="detail-meta"><span>${badge(match)}</span><span>${participants(match).length}/${match.capacity}명</span><span>${esc(match.level)}</span></div><dl class="detail-list"><div><dt>일정</dt><dd>${dateText(match.date)} ${esc(match.startTime)}–${esc(match.endTime)}</dd></div><div><dt>지역·장소</dt><dd>${esc(match.region)} · ${esc(match.venue)}</dd></div><div><dt>모집자</dt><dd><button class="inline-button" data-action="view-profile" data-id="${esc(host.id)}">${esc(host.name)} · 매너 ${host.manner.toFixed(1)} ↗</button></dd></div><div><dt>설명</dt><dd>${esc(match.description)}</dd></div></dl><div class="participant-block"><h3>확정 참가자</h3>${participants(match).map((id) => `<button class="person-pill" type="button" data-action="view-profile" data-id="${esc(id)}"><span class="avatar">${initials(userName(id))}</span>${esc(userName(id))} ↗</button>`).join('')}</div>${match.hostId === state.activeUserId ? `<div class="applicant-block"><h3>참여 신청 <small>${match.applications.filter((a) => a.status === 'pending').length}명 대기</small></h3>${match.applications.length ? match.applications.map((application) => { const applicant = getUser(state, application.userId); return `<div class="applicant-row"><button type="button" class="applicant-person" data-action="view-profile" data-id="${esc(applicant.id)}"><span class="avatar">${initials(applicant.name)}</span><span><strong>${esc(applicant.name)}</strong><small>${esc(applicant.region)} · ${esc(applicant.sports[match.sport].level)} · 매너 ${applicant.manner.toFixed(1)}</small></span></button>${application.status === 'pending' && !completed ? `<div><button class="mini-button accept" data-action="decide" data-id="${esc(match.id)}" data-user="${esc(applicant.id)}" data-decision="accepted">수락</button><button class="mini-button" data-action="decide" data-id="${esc(match.id)}" data-user="${esc(applicant.id)}" data-decision="rejected">거절</button></div>` : `<span class="status-word">${statusText[application.status]}</span>`}</div>`; }).join('') : '<p class="muted">아직 신청자가 없어요.</p>'}</div>` : ''}${completed ? `<div class="result-note">운동 완료 · ${esc(resultSummary(state.results.find((r) => r.matchId === match.id), match, state.activeUserId))}</div>` : ''}<div class="modal-actions">${canApply ? `<button class="button primary" type="button" data-action="apply" data-id="${esc(match.id)}">참여 신청</button>` : ''}${canResult ? `<button class="button primary" type="button" data-action="result" data-id="${esc(match.id)}">데모 결과 입력</button>` : ''}<button class="button outline" type="button" data-action="close">닫기</button></div>${!completed && status && status !== 'host' ? `<p class="muted">현재 상태: ${statusText[status]}</p>` : ''}</div>`;
}
function resultModal(match) {
  const ids = participants(match);
  let fields = '';
  if (match.sport === 'tennis') fields = `<label>승자<select name="winnerId" required>${ids.map((id) => `<option value="${esc(id)}">${esc(userName(id))}</option>`).join('')}</select></label><p class="form-note">단식 경기입니다. 다른 참가자에게는 패배 기록이 자동 적용됩니다.</p>`;
  if (match.sport === 'futsal') fields = `<div class="form-grid"><label>우리 팀 득점<input type="number" name="scoreFor" min="0" max="99" required value="2"></label><label>상대 팀 득점<input type="number" name="scoreAgainst" min="0" max="99" required value="1"></label><label>MVP<select name="mvpUserId" required>${ids.map((id) => `<option value="${esc(id)}">${esc(userName(id))}</option>`).join('')}</select></label></div><p class="form-note">모집된 참가자는 같은 팀입니다. 스코어로 팀 승·무·패를 계산합니다.</p>`;
  if (match.sport === 'running') fields = `<div class="running-entries">${ids.map((id) => `<fieldset><legend>${esc(userName(id))}</legend><label>거리 (km)<input type="number" min="0.1" max="200" step="0.1" required name="distance-${esc(id)}" value="5.0"></label><label>평균 페이스 (분:초 / km)<input type="text" inputmode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]" required name="pace-${esc(id)}" value="05:40" placeholder="05:40"></label></fieldset>`).join('')}</div><p class="form-note">각 참가자의 거리와 페이스가 개별 기록으로 반영됩니다.</p>`;
  return `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-head"><div><span class="eyebrow">RECORD YOUR PLAY</span><h2 id="modal-title">${SPORT_LABEL[match.sport]} 결과 입력</h2></div><button type="button" data-action="close" class="close" aria-label="닫기">×</button></div><p class="modal-intro">${esc(match.title)} · ${dateText(match.date)}<br>데모에서는 일정 날짜와 관계없이 결과를 입력해 흐름을 확인할 수 있습니다.</p><form id="result-form" data-id="${esc(match.id)}">${fields}<div class="modal-actions"><button class="button outline" type="button" data-action="details" data-id="${esc(match.id)}">뒤로</button><button class="button primary" type="submit">결과 기록하기</button></div></form></div>`;
}
function profileModal(id) {
  const user = getUser(state, id); if (!user) return '';
  return `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-head"><div><span class="eyebrow">PLAYER PROFILE</span><h2 id="modal-title">${esc(user.name)}</h2></div><button type="button" data-action="close" class="close" aria-label="닫기">×</button></div><div class="view-profile"><span class="avatar xl">${initials(user.name)}</span><p>${esc(user.region)} · ${esc(user.ageRange)} · 매너 ${user.manner.toFixed(1)}</p><blockquote>${esc(user.bio)}</blockquote>${SPORTS.map((sport) => `<div>${icon(sport)}<span><strong>${SPORT_LABEL[sport]} · ${esc(user.sports[sport].level)}</strong><small>${esc(user.sports[sport].experience)} · ${esc(user.sports[sport].preference)}${sport === 'tennis' ? ` · NTRP ${esc(user.sports.tennis.ntrp)}` : ''}<br>${esc(statNumber(id, sport))}</small></span></div>`).join('')}</div><div class="modal-actions"><button class="button outline" type="button" data-action="close">닫기</button></div></div>`;
}
function render() {
  if (corrupt) { root.innerHTML = `<main class="recovery"><div><span class="logo-mark">DWNC✳</span><h1>저장된 데모 데이터를 읽을 수 없어요.</h1><p>이 브라우저에 저장된 데이터 구조가 올바르지 않습니다. 새 예시 데이터로 다시 시작할 수 있습니다. 기존 데모 데이터는 제거됩니다.</p><button class="button primary" data-action="reset-storage">예시 데이터로 다시 시작</button></div></main>`; return; }
  const user = getUser(state, state.activeUserId); const page = route();
  const pages = { home: pageHome, matches: pageMatches, activity: pageActivity, profile: pageProfile, ranking: pageRanking };
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><a href="#/home" class="brand">DWNC<span>✳</span></a><div class="sidebar-mid"><p class="eyebrow">YOUR PLAYGROUND</p><nav aria-label="주 메뉴">${navLink('home', '홈', '⌂')}${navLink('matches', '매칭 찾기', '◎')}${navLink('activity', '내 운동', '◷')}${navLink('profile', '프로필', '♙')}${navLink('ranking', '지역 랭킹', '↗')}</nav></div><div class="sidebar-user"><span class="avatar">${initials(user.name)}</span><span><strong>${esc(user.name)}</strong><small>${esc(user.region)} · 데모 중</small></span></div></aside><div class="app-content"><header class="topbar"><div class="topbar-left"><span class="demo-chip">기기 안의 데모 데이터</span><span>${dateText(today())} · ${esc(user.region)}</span></div><label class="user-picker">데모 사용자 전환 <select id="user-switch" aria-label="데모 사용자 전환">${state.users.map((person) => `<option value="${esc(person.id)}" ${person.id === user.id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></label></header>${storageMode === 'memory' ? '<div class="storage-warning" role="status">브라우저 저장을 사용할 수 없습니다. 변경은 현재 탭에서만 유지됩니다.</div>' : ''}<div class="page-content">${pages[page](user)}</div></div></div><nav class="mobile-nav" aria-label="모바일 주 메뉴">${navLink('home', '홈', '⌂')}${navLink('matches', '매칭', '◎')}${navLink('activity', '내 운동', '◷')}${navLink('profile', '프로필', '♙')}${navLink('ranking', '랭킹', '↗')}</nav><div id="feedback" class="feedback ${flash?.error ? 'error' : 'success'}" role="status" ${flash ? '' : 'hidden'}>${flash ? esc(flash.text) : ''}</div>${modal ? `<div class="modal-backdrop" data-action="close"><div class="modal-wrap">${modal.type === 'create' ? createModal(user) : modal.type === 'details' ? detailsModal(getMatch(state, modal.id)) : modal.type === 'result' ? resultModal(getMatch(state, modal.id)) : profileModal(modal.id)}</div></div>` : ''}`;
  flash = null;
  if (modal) root.querySelector('[role="dialog"]')?.focus();
  document.title = `DWNC · ${{ home: '홈', matches: '매칭 찾기', activity: '내 운동', profile: '프로필', ranking: '지역 랭킹' }[page]}`;
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, user, decision } = button.dataset;
  if (action === 'close' && button.classList.contains('modal-backdrop') && event.target !== button) return;
  try {
    if (action === 'close') { modal = null; render(); }
    if (action === 'create') { modal = { type: 'create' }; render(); }
    if (action === 'details') { modal = { type: 'details', id }; render(); }
    if (action === 'result') { modal = { type: 'result', id }; render(); }
    if (action === 'view-profile') { modal = { type: 'profile', id }; render(); }
    if (action === 'apply') { modal = null; save(applyToMatch(state, id, state.activeUserId), '참여 신청을 보냈습니다. 모집자의 결정을 기다려 주세요.'); }
    if (action === 'decide') { modal = { type: 'details', id }; save(decideApplication(state, id, state.activeUserId, user, decision), decision === 'accepted' ? '신청을 수락했습니다. 참가자의 일정에 반영됐습니다.' : '신청을 거절했습니다.'); }
    if (action === 'reset-filters') { filters = { sport: '', region: '', venue: '', date: '', time: '', level: '', query: '', openOnly: true }; render(); }
    if (action === 'reset-storage') { try { localStorage.removeItem(STORAGE_KEY); } catch { storageMode = 'memory'; } corrupt = false; state = createSeed(); save(state, '예시 데이터로 다시 시작했습니다.'); }
  } catch (error) { feedback(error.message); }
});
root.addEventListener('change', (event) => {
  if (event.target.id !== 'user-switch') return;
  try { modal = null; save(switchUser(state, event.target.value), `${userName(event.target.value)}님으로 전환했습니다. 각 사용자는 이 브라우저의 예시 인물입니다.`); }
  catch (error) { feedback(error.message); }
});
root.addEventListener('submit', (event) => {
  const form = event.target; event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'filter-form') { filters = { ...data, openOnly: new FormData(form).has('openOnly') }; render(); return; }
    if (form.id === 'ranking-form') { rankingFilters = data; render(); return; }
    if (form.id === 'create-form') { const created = createMatch(state, state.activeUserId, data); modal = null; save(created.state, '운동 자리를 만들었습니다. 다른 데모 사용자로 전환해 신청할 수 있어요.'); location.hash = '#/activity'; return; }
    if (form.id === 'profile-form') { const sports = Object.fromEntries(SPORTS.map((sport) => [sport, { experience: data[`${sport}-experience`], level: data[`${sport}-level`], preference: data[`${sport}-preference`], ...(sport === 'tennis' ? { ntrp: data['tennis-ntrp'] } : {}) }])); save(updateProfile(state, state.activeUserId, { ...data, sports }), '프로필을 저장했습니다.'); return; }
    if (form.id === 'result-form') {
      const match = getMatch(state, form.dataset.id); let resultData;
      if (match.sport === 'tennis') resultData = { winnerId: data.winnerId };
      else if (match.sport === 'futsal') resultData = { scoreFor: data.scoreFor, scoreAgainst: data.scoreAgainst, mvpUserId: data.mvpUserId };
      else { const entries = {}; for (const id of participants(match)) { const [minutes, seconds] = String(data[`pace-${id}`]).split(':').map(Number); entries[id] = { distanceKm: Number(data[`distance-${id}`]), paceSec: minutes * 60 + seconds }; } resultData = { entries }; }
      const next = recordResult(state, match.id, state.activeUserId, resultData); modal = null; save(next, '운동 결과가 기록과 랭킹에 반영됐습니다.'); return;
    }
  } catch (error) { feedback(error.message); }
});
window.addEventListener('hashchange', () => { modal = null; render(); });
window.addEventListener('keydown', (event) => {
  if (!modal) return;
  if (event.key === 'Escape') { modal = null; render(); return; }
  if (event.key !== 'Tab') return;
  const dialog = root.querySelector('[role="dialog"]');
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((element) => element.offsetParent !== null);
  if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  else if (document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
});
render();
