import { statsFor } from './extended-domain.js';
import { deriveKongProfile, koreaToday } from './kong-profile.js';
import { renderKongCharacter } from './kong-profile-view.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Use the same attended-record boundary as Kong, then the existing competitive
// definitions. Pending proposals never enter canonical results; explicit pending
// metadata is also rejected. State is already projected by the authenticated API.
export function homeWorkoutStats(state, userId, today = koreaToday()) {
  const canonical = {...state,users:state.users || [],matches:state.matches || [],results:(state.results || []).filter(result => !result.confirmation || result.confirmation.status === 'confirmed')};
  const attended = deriveKongProfile(canonical,userId,today);
  return statsFor({...canonical,results:attended.recentResults.map(({result}) => result)},userId);
}

export function renderHomeSummary(state, user, derived, { id, mannerHtml = '', today = koreaToday(), own = true } = {}) {
  const stats = homeWorkoutStats(state,user.id,today);
  const photo = typeof user.photo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(user.photo) ? user.photo : null;
  // The thumbnail uses the same projected growth state as the existing card.
  const thumbnailView = derived.stageIndex === 0 || !derived.total ? '40 108 120 96' : derived.stageIndex < 4 ? '16 52 168 150' : '-8 -26 216 228';
  const image = photo ? `<img src="${esc(photo)}" alt="${esc(user.name || '운동 친구')}님의 프로필 사진">` : renderKongCharacter(user,derived,{reducedMotion:true}).replace('viewBox="-8 -26 216 228"',`viewBox="${thumbnailView}"`);
  const metric = (label,value,unit='') => `<div><dt>${label}</dt><dd>${esc(value)}${unit ? `<small>${unit}</small>` : ''}</dd></div>`;
  const sportTitle = (english,korean) => `<h3 aria-label="${korean}">${english}</h3>`;
  const demo = own && state.demoControls === true ? `<section class="home-summary-demo" aria-label="시연 기록"><button type="button" class="btn soft sm" data-action="demo-add-records">운동 10회 추가</button><button type="button" class="text-btn" data-action="demo-reset-records">시연 기록 초기화</button></section>` : '';
  return `<div class="home-summary"><div class="home-summary-label"><p>${own ? '내 플레이 프로필' : '플레이 프로필'}</p>${!own && user.friendCode ? `<span class="passport-number">${esc(user.friendCode)}</span>` : ''}</div>
    <div class="home-summary-identity"><div class="home-summary-photo${photo ? ' is-photo' : ''}">${image}</div><div class="home-summary-person"><h2 class="home-summary-name" id="${esc(id)}-name">${esc(user.name || '운동 친구')}</h2><dl class="home-summary-meta"><div><dt>주활동 지역</dt><dd>${esc(user.region || '미입력')}</dd></div><div><dt>연령대</dt><dd>${esc(user.ageRange || '미입력')}</dd></div></dl>${mannerHtml}</div></div>
    <ul class="home-summary-sports" aria-label="종목별 운동 통계"><li data-home-sport="tennis">${sportTitle('TENNIS','테니스')}<dl>${metric('경기 수',stats.tennis.games,'회')}${metric('승률',stats.tennis.games ? stats.tennis.winRate : '—',stats.tennis.games ? '%' : '')}</dl></li><li data-home-sport="futsal">${sportTitle('FUTSAL','풋살')}<dl>${metric('경기 수',stats.futsal.games,'회')}${metric('MVP 선정',stats.futsal.mvp,'회')}</dl></li><li data-home-sport="running">${sportTitle('RUNNING','러닝')}<dl>${metric('누적 거리',stats.running.distanceKm,'km')}</dl></li></ul>${demo}</div>`;
}
