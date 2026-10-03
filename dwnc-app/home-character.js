import { today, SPORTS } from './domain.js';

export const KONG_PREVIEW_IMAGE = './assets/kong-preview-v1.png';
let characterProvider = null;

export function normalizeKongNickname(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 16 ? name : null;
}

// Integration boundary: main's character implementation supplies nickname, artwork and levels.
// This preview deliberately has no competing growth formula or persistent character model.
export function registerHomeCharacterProvider(provider) {
  if (provider !== null && typeof provider !== 'function') throw new TypeError('Character provider must be a function or null');
  characterProvider = provider;
}

export function recentSportActivity(state, userId, date = today()) {
  const [year, month, day] = date.split('-').map(Number);
  const since = new Date(Date.UTC(year, month - 1, day) - 29 * 86400000).toISOString().slice(0, 10);
  const counts = Object.fromEntries(SPORTS.map(sport => [sport, 0]));
  const matches = new Map(state.matches.map(match => [match.id, match]));
  const counted = new Set();
  for (const result of state.results) {
    const match = matches.get(result.matchId);
    if (!match || counted.has(match.id) || !SPORTS.includes(match.sport) || match.status === 'cancelled' || match.date < since || match.date > date || !result.attendedIds.includes(userId)) continue;
    counted.add(match.id); counts[match.sport]++;
  }
  return counts;
}

const safeImage = value => typeof value === 'string' && (/^\.\/assets\/[a-zA-Z0-9_-]+\.(png|webp|jpg|svg)$/.test(value) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
export function homeCharacterFor(state, userId, date = today()) {
  let supplied;
  try { supplied = characterProvider?.(state, userId); } catch { supplied = null; }
  const imageUrl = safeImage(supplied?.imageUrl) ? supplied.imageUrl : KONG_PREVIEW_IMAGE;
  const levels = Object.fromEntries(SPORTS.map(sport => [sport, Number.isInteger(supplied?.levels?.[sport]) && supplied.levels[sport] >= 1 ? supplied.levels[sport] : null]));
  return { imageUrl, levels, nickname: normalizeKongNickname(supplied?.nickname) || '콩식이', preview: imageUrl === KONG_PREVIEW_IMAGE, recent: recentSportActivity(state, userId, date) };
}
