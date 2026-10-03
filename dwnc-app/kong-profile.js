import { SPORTS } from './domain.js';
export { koreaToday } from './clock.js';

// Display examples from the approved mockup, rather than permanent product rules.
export const KONG_PREVIEW_POLICY = Object.freeze({
  stageThresholds: Object.freeze([1, 5, 15, 30, 50, 100]),
  itemThresholds: Object.freeze([1, 10, 25, 50]),
  energeticMinRecent7: 3,
  freshMaxDays: 7,
  wiltedMaxDays: 14,
  includeNoContest: true,
});

const DAY_MS = 24 * 60 * 60 * 1000;
function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return NaN;
  return time / DAY_MS;
}

const dateString = (number) => new Date(number * DAY_MS).toISOString().slice(0, 10);
const levelAt = (count, thresholds) => thresholds.filter((threshold) => count >= threshold).length;

/**
 * Derive only from saved, attended matches in this user's visible API state.
 * `today` is an explicit Korean YYYY-MM-DD date; day arithmetic has no host timezone.
 * recentResults contains all qualifying {match,result} entries, newest first.
 * dailyCounts14 contains today and the preceding 13 dates, oldest first.
 */
export function deriveKongProfile(state, userId, today, policy = KONG_PREVIEW_POLICY) {
  const todayNumber = dateNumber(today);
  if (!Number.isFinite(todayNumber)) throw new RangeError('today must be a valid Korean YYYY-MM-DD date');

  const counts = Object.fromEntries(SPORTS.map((sport) => [sport, 0]));
  const recentResults = [], counted = new Set(), dailyCounts = new Map();
  const matches = new Map(state.matches.map((match) => [match.id, match]));
  let recent7 = 0, recent14 = 0, latestDate = null;

  if (state.users.some((user) => user.id === userId)) for (const result of state.results) {
    const match = matches.get(result.matchId);
    if (!match || match.status === 'cancelled' || !SPORTS.includes(match.sport) || result.sport !== match.sport || counted.has(result.matchId)) continue;
    if (!Array.isArray(result.attendedIds) || !result.attendedIds.includes(userId)) continue;
    const accepted = match.hostId === userId || match.applications.some((application) => application.userId === userId && application.status === 'accepted');
    if (!accepted || result.noContest && !policy.includeNoContest) continue;
    const exerciseDate = dateNumber(match.date);
    if (!Number.isFinite(exerciseDate) || exerciseDate > todayNumber) continue;

    counted.add(result.matchId);
    counts[match.sport]++;
    recentResults.push({ match, result });
    dailyCounts.set(match.date, (dailyCounts.get(match.date) || 0) + 1);
    const elapsed = todayNumber - exerciseDate;
    if (elapsed < 7) recent7++;
    if (elapsed < 14) recent14++;
    latestDate = latestDate === null ? exerciseDate : Math.max(latestDate, exerciseDate);
  }

  recentResults.sort((left, right) => right.match.date.localeCompare(left.match.date) || right.match.startTime.localeCompare(left.match.startTime));
  const total = counted.size;
  const daysSinceLastExercise = latestDate === null ? null : todayNumber - latestDate;
  const stageIndex = total ? Math.max(0, levelAt(total, policy.stageThresholds) - 1) : null;
  // Match the preserved Kong renderer's order: sleeping, wilted, fresh, energetic.
  const conditionIndex = !total ? null : recent7 >= policy.energeticMinRecent7 ? 3 : daysSinceLastExercise <= policy.freshMaxDays ? 2 : daysSinceLastExercise <= policy.wiltedMaxDays ? 1 : 0;
  const itemLevels = Object.fromEntries(SPORTS.map((sport) => [sport, levelAt(counts[sport], policy.itemThresholds)]));
  const dailyCounts14 = Array.from({ length: 14 }, (_, index) => {
    const date = dateString(todayNumber - 13 + index);
    return { date, count: dailyCounts.get(date) || 0 };
  });
  return { counts, total, stageIndex, conditionIndex, itemLevels, daysSinceLastExercise, recent7, recent14, dailyCounts14, recentResults };
}
