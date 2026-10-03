import { renderKongHero } from './kong-profile-view.js';

const SPORTS = { tennis: '테니스', futsal: '풋살', running: '러닝' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const field = value => value ? esc(value) : '미입력';
const count = value => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
let cardCount = 0;

function publicIdentity(user, derived, id) {
  const chosen = [...new Set((user.chosenSports || []).filter(sport => SPORTS[sport]))];
  const photo = typeof user.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(user.photo) ? user.photo : null;
  const image = photo ? `<img src="${esc(photo)}" alt="${esc(user.name || '운동 친구')}님의 프로필 사진">` : `<span aria-hidden="true">${esc(user.avatar || user.name?.slice(-1) || '✳')}</span>`;
  const sports = chosen.map(sport => {
    const detail = user.sports?.[sport] || {};
    return `<li class="passport-sport" data-passport-sport="${sport}"><span class="passport-sport-main"><b>${SPORTS[sport]}</b><small>구력 ${field(detail.experience)}</small></span><span class="passport-sport-level">${field(detail.level)}</span></li>`;
  }).join('');
  return `<div class="passport-top"><p class="passport-eyebrow">SPORT ID</p>${user.friendCode ? `<span class="passport-number">${esc(user.friendCode)}</span>` : ''}</div>
    <div class="passport-identity"><div class="passport-photo">${image}</div><div><span class="passport-nickname">닉네임</span><h2 id="${id}-name" class="passport-name">${esc(user.name || '운동 친구')}</h2></div></div>
    <dl class="passport-fields"><div><dt>성별</dt><dd>${field(user.gender)}</dd></div><div><dt>나이</dt><dd>${field(user.ageRange)}</dd></div><div><dt>활동 지역</dt><dd>${field(user.region)}</dd></div></dl>
    ${user.bio ? `<p class="passport-bio">${esc(user.bio)}</p>` : ''}
    ${sports ? `<ul class="passport-sports" aria-label="종목별 구력과 수준">${sports}</ul>` : '<p class="passport-empty">종목을 선택하면 구력이 표시돼요.</p>'}
    <div class="passport-total"><span>기록된 운동</span><strong>${count(derived.total)}<small>회</small></strong></div>`;
}

// Both faces occupy the same grid cell. The inactive face is inert while CSS
// turns the rotor, so the external control retains focus throughout the flip.
export function renderPassportCard(state, user, derived, options = {}) {
  const id = `passport-${++cardCount}`;
  const flipped = Boolean(options.flipped);
  return `<section class="passport-card" data-passport-user="${esc(user.id)}" aria-label="${esc(user.name || '운동 친구')}님의 운동 프로필"><div class="passport-flip" data-flipped="${flipped}" data-reduced-motion="${Boolean(options.reducedMotion)}">
    <div id="${id}-rotor" class="passport-rotor">
      <section class="passport-face passport-front kong-glass" aria-hidden="${flipped}"${flipped ? ' inert' : ''} aria-labelledby="${id}-name">${publicIdentity(user, derived, id)}</section>
      <section class="passport-face passport-back" aria-hidden="${!flipped}"${flipped ? '' : ' inert'} aria-label="콩 키우기 카드">${renderKongHero(user, derived, options)}</section>
    </div></div>
    <button type="button" class="passport-flip-btn" data-action="flip-passport" data-user="${esc(user.id)}" aria-controls="${id}-rotor" aria-pressed="${flipped}">${flipped ? '신분증 보기' : '콩 키우기 보기'}</button>
  </section>`;
}
