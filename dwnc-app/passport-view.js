import { renderKongHero } from './kong-profile-view.js';
import { renderHomeSummary } from './home-summary.js';

const SPORTS = { tennis: '테니스', futsal: '풋살', running: '러닝' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const field = value => value ? esc(value) : '미입력';
const count = value => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
let cardCount = 0;

function publicManner(user) {
  const summary = user.publicMannerSummary;
  const hasRatings = Number.isInteger(summary?.count) && summary.count > 0 && Number.isFinite(summary.average) && summary.average >= 1 && summary.average <= 5;
  const average = hasRatings ? Math.round(summary.average * 10) / 10 : 0;
  const label = hasRatings ? `매너 평점 5점 만점에 ${average.toFixed(1)}점, 실제 평가 ${summary.count}건` : '매너 평가가 아직 없습니다';
  const stars = Array.from({ length: 5 }, (_, index) => {
    const fill = Math.round(Math.min(1, Math.max(0, average - index)) * 100);
    return `<span class="passport-manner-star" style="--star-fill:${fill}%" aria-hidden="true"><span class="passport-manner-empty">★</span><span class="passport-manner-fill">★</span></span>`;
  }).join('');
  return `<div class="passport-manner"><span class="passport-manner-label">매너 평가</span><div class="passport-manner-summary"><span class="passport-manner-stars" role="img" aria-label="${label}">${stars}</span><span class="passport-manner-value" aria-hidden="true">${hasRatings ? `${average.toFixed(1)} / 5 · ${summary.count}건` : '아직 평가가 없어요'}</span></div></div>`;
}

function publicIdentity(user, derived, id, showManner = true, compact = false) {
  const chosen = [...new Set((user.chosenSports || []).filter(sport => SPORTS[sport]))];
  const photo = typeof user.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(user.photo) ? user.photo : null;
  const image = photo ? `<img src="${esc(photo)}" alt="${esc(user.name || '운동 친구')}님의 프로필 사진">` : `<span aria-hidden="true">${esc(user.avatar || user.name?.slice(-1) || '✳')}</span>`;
  const sports = chosen.map(sport => {
    const detail = user.sports?.[sport] || {};
    return `<li class="passport-sport" data-passport-sport="${sport}"><span class="passport-sport-main"><b>${SPORTS[sport]}</b><small>구력 ${field(detail.experience)}</small></span><span class="passport-sport-level">${field(detail.level)}</span></li>`;
  }).join('');
  return `${compact ? '' : `<div class="passport-top"><p class="passport-eyebrow">SPORT ID</p>${user.friendCode ? `<span class="passport-number">${esc(user.friendCode)}</span>` : ''}</div>
    <div class="passport-identity"><div class="passport-photo">${image}</div><div><span class="passport-nickname">닉네임</span><h2 id="${id}-name" class="passport-name">${esc(user.name || '운동 친구')}</h2></div></div>
    `}
    <dl class="passport-fields"><div><dt>성별</dt><dd>${field(user.gender)}</dd></div><div><dt>나이</dt><dd>${field(user.ageRange)}</dd></div><div><dt>활동 지역</dt><dd>${field(user.region)}</dd></div></dl>
    ${user.bio ? `<p class="passport-bio">${esc(user.bio)}</p>` : ''}
    ${sports ? `<ul class="passport-sports" aria-label="종목별 구력과 수준">${sports}</ul>` : '<p class="passport-empty">종목을 선택하면 구력이 표시돼요.</p>'}
    ${showManner ? publicManner(user) : ''}
    <div class="passport-total"><span>기록된 운동</span><strong>${count(derived.total)}<small>회</small></strong></div>`;
}

// Both faces occupy the same grid cell. The inactive face is inert while CSS
// turns the rotor, so the external control retains focus throughout the flip.
export function renderPassportCard(state, user, derived, options = {}) {
  const id = `passport-${++cardCount}`;
  const flipped = Boolean(options.flipped);
  const identity = options.own
    ? `${renderHomeSummary(state,user,derived,{id,mannerHtml:publicManner(user)})}<details class="home-summary-details"><summary>프로필 자세히 보기</summary><div class="home-summary-details-content">${publicIdentity(user,derived,`${id}-details`,false)}</div></details>`
    : `${renderHomeSummary(state,user,derived,{id,mannerHtml:publicManner(user),own:false})}<div class="home-summary-public-details">${publicIdentity(user,derived,`${id}-details`,false,true)}</div>`;
  return `<section class="passport-card" data-home-summary="true" data-home-owner="${Boolean(options.own)}" data-passport-user="${esc(user.id)}" aria-label="${esc(user.name || '운동 친구')}님의 운동 프로필"><div class="passport-flip" data-flipped="${flipped}" data-reduced-motion="${Boolean(options.reducedMotion)}">
    <div id="${id}-rotor" class="passport-rotor">
      <section class="passport-face passport-front kong-glass" aria-hidden="${flipped}"${flipped ? ' inert' : ''} aria-labelledby="${id}-name">${identity}</section>
      <section class="passport-face passport-back" aria-hidden="${!flipped}"${flipped ? '' : ' inert'} aria-label="콩 키우기 카드">${renderKongHero(user, derived, options)}</section>
    </div></div>
    <button type="button" class="passport-flip-btn" data-action="flip-passport" data-user="${esc(user.id)}" aria-controls="${id}-rotor" aria-pressed="${flipped}">${flipped ? '신분증 보기' : '콩 성장 보기'}</button>
  </section>`;
}
