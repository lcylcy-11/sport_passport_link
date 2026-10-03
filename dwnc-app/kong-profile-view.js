import { render, itemIcon, STAGES, CONDS } from './kong.js';

const SPORTS = {
  tennis: { name: '테니스', item: '라켓', items: ['연습용 우드 라켓', '클럽 라켓', '프로 라켓', '레전드 골드 라켓'] },
  futsal: { name: '풋살', item: '공', items: ['동네 연습공', '클래식 볼', '프로 매치볼', '골든 볼'] },
  running: { name: '러닝', item: '러닝화', items: ['기본 운동화', '데일리 러너', '레이싱 슈즈', '골든 윙 슈즈'] },
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const count = value => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
let viewCount = 0;

function sportsFor(user, derived) {
  const chosen = [...new Set((user.chosenSports || []).filter(sport => SPORTS[sport]))];
  return chosen.length ? chosen : Object.keys(SPORTS).filter(sport => count(derived.counts?.[sport]) > 0);
}

function characterState(user, derived, options) {
  const hasExercise = count(derived.total) > 0;
  const stage = hasExercise && STAGES[derived.stageIndex] ? derived.stageIndex : 0;
  const cond = hasExercise && CONDS[derived.conditionIndex] ? derived.conditionIndex : 2;
  const mainSport = sportsFor(user, derived)[0] || 'tennis';
  const itemLevel = Math.min(4, count(derived.itemLevels?.[mainSport]));
  const motion = hasExercise && !options.reducedMotion;
  const react = motion && options.reaction === 'react';
  return { stage, cond, mainSport, itemLevel, motion, react, hasExercise };
}

// Root can replace only the artwork for a reaction, preserving focus and scroll.
export function renderKongCharacter(user, derived, options = {}) {
  const state = characterState(user, derived, options);
  return render({
    cond: state.cond, stage: state.stage, items: { [state.mainSport]: state.itemLevel },
    motion: state.motion, react: state.react, enter: state.motion ? options.enter || '' : '', sky: false,
    label: state.hasExercise ? `콩, ${STAGES[state.stage].name}, ${CONDS[state.cond].name}` : '첫 운동을 기다리는 아기 콩',
  });
}

function conditionNote(derived, state) {
  if (!state.hasExercise) return '첫 운동을 기록하면 콩과 함께하는 시간이 시작돼요.';
  if (state.cond === 3) return '꾸준히 운동한 덕분에 콩이 쌩쌩해요.';
  if (state.cond === 2) return derived.daysSinceLastExercise === 0 ? '오늘도 함께 운동했어요.' : `마지막 운동은 ${count(derived.daysSinceLastExercise)}일 전이에요.`;
  return `${count(derived.daysSinceLastExercise)}일째 쉬는 중이에요. 다시 함께 운동해 볼까요?`;
}

function resultText(result, sport, userId) {
  if (sport === 'running') return `${result.entries?.[userId]?.distanceKm ?? 0}km`;
  if (result.noContest) return '미성립';
  if (sport === 'tennis') {
    const won = result.teams?.[result.winnerTeam]?.includes(userId) || result.winnerId === userId;
    const score = Number.isFinite(result.scoreA) && Number.isFinite(result.scoreB) ? ` ${result.scoreA}:${result.scoreB}` : '';
    return `${won ? '승리' : '패배'}${score}`;
  }
  const outcome = { win: '승리', loss: '패배', draw: '무승부' }[result.teamOutcome] || '완료';
  const score = Number.isFinite(result.scoreFor) && Number.isFinite(result.scoreAgainst) ? ` ${result.scoreFor}:${result.scoreAgainst}` : '';
  return `${result.mvpUserId === userId ? 'MVP · ' : ''}${outcome}${score}`;
}

function recentActivity(user, derived, id, options = {}) {
  const days = derived.dailyCounts14 || [];
  const start = days[0]?.date, end = days.at(-1)?.date;
  const recent = (derived.recentResults || []).filter(({ match }) => (!start || match.date >= start) && (!end || match.date <= end));
  const max = Math.max(1, ...days.map(day => count(day.count)));
  const bars = days.map(day => {
    const amount = count(day.count);
    return `<span class="kong-day${amount ? ' is-active' : ''}${day.date === end ? ' is-today' : ''}" data-kong-day="${esc(day.date)}" data-count="${amount}" role="img" aria-label="${esc(day.date)}, 운동 ${amount}회" title="${esc(day.date)} · ${amount}회"><i style="height:${amount ? 30 + amount / max * 70 : 12}%"></i></span>`;
  }).join('');
  const rows = recent.slice(0, 5).map(({ match, result }) => `<button type="button" class="kong-log-row" data-action="details" data-id="${esc(match.id)}"><time datetime="${esc(match.date)}">${esc(match.date.slice(5).replace('-', '.'))}</time><span class="kong-log-main"><b>${SPORTS[match.sport]?.name || esc(match.sport)}</b><small>${esc(match.venue)}</small></span><span class="kong-log-result">${esc(resultText(result, match.sport, user.id))}</span><span class="kong-log-arrow" aria-hidden="true">›</span></button>`).join('');
  return `<section class="kong-card kong-glass kong-history" data-kong-activity aria-labelledby="${id}-history"><div class="kong-card-head"><h2 id="${id}-history">최근 운동</h2><span>최근 2주 <b>${count(derived.recent14)}회</b></span></div><div class="kong-bars" aria-label="최근 14일 운동 기록">${bars}</div><div class="kong-bar-labels"><span>${esc(start?.slice(5).replace('-', '.') || '')}</span><span>오늘</span></div>${rows ? `<div class="kong-log">${rows}</div>` : '<p class="kong-empty">최근 2주 동안 기록한 운동이 없어요.<br>운동을 마친 뒤 첫 기록을 남겨 보세요.</p>'}${options.own === false ? '' : `<a class="kong-history-link" href="${options.activityHref || '#/activity'}">내 운동 보기 <span aria-hidden="true">→</span></a>`}</section>`;
}

export function renderKongHistory(user, derived, options = {}) {
  return `<div class="kong-history-shell">${recentActivity(user, derived, `kong-profile-${++viewCount}`, { ...options, activityHref: '#/matches' })}</div>`;
}

export function renderKongHero(user, derived, options = {}) {
  return renderKongProfile(user, derived, { ...options, compactHero: true });
}

export function renderKongProfile(user, derived, options = {}) {
  const id = `kong-profile-${++viewCount}`;
  const state = characterState(user, derived, options);
  const main = SPORTS[state.mainSport], total = count(derived.total);
  const identity = [user.ageRange, user.gender && user.gender !== '미입력' ? user.gender : '', user.region].filter(Boolean).map(esc).join(' · ');
  const motion = !state.motion ? 'static' : state.react ? 'react' : 'idle';
  const condition = state.hasExercise ? CONDS[state.cond].name : '첫 기록';
  const gearName = main.items[state.itemLevel - 1] || '아직 아이템이 없어요';
  const photo = typeof user.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(user.photo) ? user.photo : null;
  const avatar = `<span class="kong-avatar" aria-label="프로필 사진">${photo ? `<img src="${esc(photo)}" alt="">` : esc(user.avatar || user.name?.slice(-1) || '✳')}</span>`;
  const sportItems = sportsFor(user, derived).map(sport => `<span data-kong-item="${sport}" data-level="${Math.min(4, count(derived.itemLevels?.[sport]))}">${SPORTS[sport].name} <b>Lv.${Math.min(4, count(derived.itemLevels?.[sport]))}</b></span>`).join('');
  const cta = href => `<a class="kong-cta" href="${href}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5C13.5 7 15 9.6 15 12a5 5 0 0 1-10 0c0-2.4 1.5-5 5-9.5Z"/></svg>운동 기록하기</a>`;
  const heroCopy = options.compactHero
    ? `<div class="kong-hero-copy"><p class="kong-eyebrow">운동 친구 <b>콩</b> · ${state.hasExercise ? `${STAGES[state.stage].name} 단계` : '첫 운동을 기다려요'}</p><h2 id="${id}-name" class="kong-title">콩 키우기</h2>${options.own ? cta('#/matches') : ''}</div>`
    : `<div class="kong-hero-copy"><div class="kong-identity-top"><p class="kong-eyebrow">운동 친구 <b>콩</b> · ${state.hasExercise ? `${STAGES[state.stage].name} 단계` : '첫 운동을 기다려요'}</p>${avatar}</div><h2 id="${id}-name" class="kong-name">${esc(user.name)}</h2><p class="kong-hero-sub">${identity}</p>${user.bio ? `<p class="kong-bio">${esc(user.bio)}</p>` : ''}${cta('#/activity')}</div>`;
  return `<div class="kong-profile${options.compactHero ? ' kong-profile-compact' : ''}" data-total="${total}" data-stage="${state.hasExercise ? state.stage : ''}" data-condition="${state.hasExercise ? state.cond : ''}" data-kong-total="${total}" data-kong-main-sport="${state.mainSport}">
    <section class="kong-hero kong-glass" data-cond="${state.hasExercise ? state.cond : ''}" aria-labelledby="${id}-name">
      ${heroCopy}
      <div class="kong-orb-stage"><span class="kong-glass-orb" aria-hidden="true"></span><button type="button" class="kong-mascot" data-action="kong-react" data-kong-motion="${motion}" data-kong-stage="${state.stage}" aria-label="콩 쓰다듬기"><span class="kong-art">${renderKongCharacter(user, derived, options)}</span></button><span class="kong-mood kong-glass">${condition}</span>${state.react ? '<span class="kong-bubble" role="status">같이 운동하니까 좋아!</span>' : ''}</div>
      <p class="kong-note">${conditionNote(derived, state)}</p>
      <dl class="kong-stat-strip"><div><dt>지금 상태</dt><dd>${condition}</dd></div><div><dt>함께한 운동</dt><dd>${total}<small>회</small></dd></div><div><dt>${main.item}</dt><dd>Lv.${state.itemLevel}</dd></div></dl>
      ${options.compactHero && sportItems ? `<div class="kong-sport-items" aria-label="종목별 아이템 레벨">${sportItems}</div>` : ''}
    </section>
    ${options.compactHero ? '' : `<section class="kong-card kong-glass kong-gear" data-kong-main-item="${state.mainSport}" data-level="${state.itemLevel}" aria-labelledby="${id}-gear"><div class="kong-gear-copy"><div class="kong-card-head"><h2 id="${id}-gear">장착 아이템</h2><span>${main.name}</span></div><p class="kong-gear-level">Lv.<b>${state.itemLevel}</b></p><p class="kong-gear-name">${gearName}</p><p class="kong-gear-note">${state.itemLevel ? `${main.name} ${count(derived.counts?.[state.mainSport])}회와 함께한 아이템` : `첫 ${main.name} 기록을 기다리고 있어요.`}</p>${sportItems ? `<div class="kong-sport-items" aria-label="종목별 아이템 레벨">${sportItems}</div>` : ''}</div><div class="kong-gear-tile">${state.itemLevel ? itemIcon(state.mainSport, state.itemLevel) : '<span class="kong-gear-empty" aria-hidden="true">＋</span>'}<span>${state.itemLevel ? '착용 중' : '첫 운동부터'}</span></div></section>${recentActivity(user, derived, id)}`}
  </div>`;
}
