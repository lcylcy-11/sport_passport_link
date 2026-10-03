import { SPORTS, isCompleted, participants } from './domain.js';
import { canRequestMatch, statsFor } from './extended-domain.js';
import { deriveKongProfile, koreaToday } from './kong-profile.js';

const round = (value) => Math.round(value * 10) / 10;
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const compareMatches = (left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id);

/** Only an exact duration is scored; vague career descriptions stay unscored. */
export function parseExperienceMonths(value) {
  if (typeof value !== 'string') return 0;
  const parts = /^(?:(\d+(?:\.\d+)?)\s*년)?\s*(?:(\d+)\s*(?:개월|달))?$/.exec(value.trim());
  if (!parts || !parts[1] && !parts[2]) return 0;
  const months = Number(parts[1] || 0) * 12 + Number(parts[2] || 0);
  return Number.isSafeInteger(months) && months >= 0 ? months : 0;
}

/**
 * Region is the participant's declared home/activity region, not the venue.
 * Only publicly visible matches are ranked: private friend/group workouts
 * never affect the score, even in the owner's state. This gives every viewer
 * the same region ranking while private records still grow the owner's Kong.
 * All-time public competitive win rate contributes 0–50, declared career 0–20
 * (10 years maximum), and publicly recorded attended sport sessions in 14 days
 * 0–30 (6 sessions maximum). Running has no competitive score. Unknown career
 * and no history remain zero; zero-only accounts do not receive a rank.
 * Each row exposes user, stats, score, games, winRate, careerMonths, recent14
 * and winPoints/careerPoints/recentPoints so the UI can explain the score.
 */
export function regionalRanking(state, sport, { region = '', today = koreaToday() } = {}) {
  if (!SPORTS.includes(sport)) return [];
  const publicState = { ...state, matches: state.matches.filter((match) => match.visibility === 'public') };
  const rows = [];
  for (const user of state.users) {
    if (!user.chosenSports.includes(sport) || region && user.region !== region) continue;
    const profile = deriveKongProfile(publicState, user.id, today);
    const records = profile.recentResults.filter(({ match }) => match.sport === sport);
    const careerMonths = parseExperienceMonths(user.sports[sport].experience);
    if (!records.length && !careerMonths) continue;
    // Reuse competitive metric rules only after the attended/date/dedup filter.
    const stats = statsFor({ ...state, results: records.map(({ result }) => result) }, user.id, { sport });
    const games = sport === 'running' ? 0 : stats[sport].games;
    const winRate = games ? Math.round(stats[sport].wins / games * 100) : 0;
    const recentDates = new Set(profile.dailyCounts14.map(({ date }) => date));
    const recent14 = records.filter(({ match }) => recentDates.has(match.date)).length;
    const winPoints = winRate / 2;
    const careerPoints = round(Math.min(careerMonths, 120) / 120 * 20);
    const recentPoints = Math.min(recent14, 6) * 5;
    rows.push({ user, stats, games, winRate, careerMonths, recent14, winPoints, careerPoints, recentPoints, score: round(winPoints + careerPoints + recentPoints) });
  }
  return rows.sort((left, right) => right.score - left.score || right.recent14 - left.recent14 || right.winRate - left.winRate || left.user.name.localeCompare(right.user.name, 'ko') || left.user.id.localeCompare(right.user.id));
}

const koreanTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function requestClock(today, now) {
  const date = new Date(`${today}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== today) throw new RangeError('today must be a valid Korean YYYY-MM-DD date');
  // Eligibility helpers read local fields. Give them the chosen Korean day and
  // Korean wall-clock fields independently of the host operating-system zone.
  return new Date(`${today}T${koreanTime.format(now)}:00`);
}
const wallTime = (clock) => `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
const endedBy = (match, today, time) => !match || match.date < today || match.date === today && match.endTime <= time;

/** A schedule is past at its Korean end-time boundary; status is unaffected. */
export function isPastSchedule(match, { today = koreaToday(), now = new Date() } = {}) {
  return endedBy(match, today, wallTime(requestClock(today, now)));
}

const overlaps = (left, right) => left.date === right.date && left.startTime < right.endTime && right.startTime < left.endTime;
const gap = (left, right) => Math.min(Math.abs(minutes(left.startTime) - minutes(right.endTime)), Math.abs(minutes(right.startTime) - minutes(left.endTime)));

/**
 * Return {match,reasons:string[],schedule:match|null} rows, with public/friend/
 * group access and existing request eligibility honored. Suggestions use the
 * viewer's chosen sports and region, exclude any overlap with confirmed future
 * schedules across sports, and put same-day/nearby-time opportunities first.
 * `now` is optional for deterministic tests; wall-clock cutoffs use Korea time.
 */
export function matchingSuggestions(state, userId, { today = koreaToday(), now = new Date(), limit = 4 } = {}) {
  const user = state.users.find((person) => person.id === userId);
  if (!user) return [];
  const clock = requestClock(today, now);
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 4;
  const time = wallTime(clock);
  const schedules = state.matches.filter((match) => match.status === 'open' && participants(match).includes(userId) && !isCompleted(state, match.id) && !endedBy(match, today, time));
  const rows = [];
  for (const match of state.matches) {
    if (match.region !== user.region || !user.chosenSports.includes(match.sport) || !canRequestMatch(state, match, userId, clock) || schedules.some((schedule) => overlaps(match, schedule))) continue;
    const schedule = schedules.filter((item) => item.date === match.date).sort((left, right) => gap(match, left) - gap(match, right) || compareMatches(left, right))[0] || null;
    const reasons = ['내 활동 지역', '내가 선택한 종목'];
    let priority = 0;
    if (schedule) {
      reasons.push('내 일정과 같은 날', '확정 일정과 시간 겹침 없음'); priority += 2;
      if (gap(match, schedule) <= 120) { reasons.push('확정 일정 전후 2시간 이내'); priority++; }
    }
    rows.push({ match, reasons, schedule, priority });
  }
  return rows.sort((left, right) => right.priority - left.priority || compareMatches(left.match, right.match)).slice(0, count).map(({ match, reasons, schedule }) => ({ match, reasons, schedule }));
}
