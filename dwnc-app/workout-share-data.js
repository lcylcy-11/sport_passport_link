const text = value => typeof value === 'string' ? value : '';
const optionalText = value => typeof value === 'string' && value.trim() ? value : null;
const score = value => Number.isInteger(value) && value >= 0 ? value : null;
const photo = value => typeof value === 'string' && value.length <= 200000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;

function metricsFor(result, ownerId) {
  if (result.sport === 'tennis') {
    if (result.noContest) return { kind: 'tennis', noContest: true, scoreA: null, scoreB: null, outcome: 'no-contest' };
    if (![0, 1].includes(result.winnerTeam) || !result.teams?.some(team => team.includes(ownerId))) return null;
    return { kind: 'tennis', noContest: false, scoreA: score(result.scoreA), scoreB: score(result.scoreB), outcome: result.teams[result.winnerTeam].includes(ownerId) ? 'win' : 'loss' };
  }
  if (result.sport === 'futsal') {
    if (!['win', 'loss', 'draw'].includes(result.teamOutcome) || score(result.scoreFor) === null || score(result.scoreAgainst) === null) return null;
    return { kind: 'futsal', scoreFor: result.scoreFor, scoreAgainst: result.scoreAgainst, outcome: result.teamOutcome, isMvp: result.mvpUserId === ownerId, position: optionalText(result.positions?.[ownerId]) };
  }
  if (result.sport === 'running') {
    const entry = result.entries?.[ownerId];
    if (!Number.isFinite(entry?.distanceKm) || entry.distanceKm <= 0 || !Number.isFinite(entry.paceSec) || entry.paceSec <= 0) return null;
    return { kind: 'running', distanceKm: entry.distanceKm, paceSec: entry.paceSec, review: optionalText(result.reviews?.[ownerId]) };
  }
  return null;
}

function projectRecord(state, owner, result) {
  // state.results is the canonical final-record collection. Explicitly pending
  // metadata is also rejected so callers cannot accidentally export proposals.
  if (!result.attendedIds?.includes(owner.id) || result.confirmation && result.confirmation.status !== 'confirmed') return null;
  const match = state.matches?.find(item => item.id === result.matchId);
  if (!match || match.sport !== result.sport) return null;
  const metrics = metricsFor(result, owner.id);
  if (!metrics) return null;
  const place = match.location || {};
  return {
    schemaVersion: 1, recordId: match.id, ownerId: owner.id,
    confirmation: { status: 'confirmed', confirmedAt: result.confirmation ? optionalText(result.confirmation.confirmedAt) : null, legacy: !result.confirmation || result.confirmation.legacy === true },
    sport: match.sport, date: text(match.date), startTime: text(match.startTime), endTime: text(match.endTime), title: text(match.title),
    location: { label: text(place.label ?? match.venue), address: text(place.address ?? match.address), region: text(place.region ?? match.region), latitude: null, longitude: null, placeId: null, provider: null },
    profile: { displayName: text(owner.name), avatar: text(owner.avatar), photo: photo(owner.photo) },
    participantCount: new Set(result.attendedIds).size,
    metrics,
  };
}

/** Return detached, allowlisted v1 card inputs from the caller's projected state. */
export function listConfirmedWorkoutShareData(state, ownerId, { date } = {}) {
  const owner = state?.users?.find(user => user.id === ownerId);
  if (!owner) return [];
  return (state.results || []).map(result => projectRecord(state, owner, result)).filter(record => record && (date === undefined || record.date === date))
    .sort((left, right) => right.date.localeCompare(left.date) || right.startTime.localeCompare(left.startTime) || left.recordId.localeCompare(right.recordId));
}

/** Return one attended final record, or null for a missing/pending/absent record. */
export function getConfirmedWorkoutShareData(state, ownerId, matchId) {
  return listConfirmedWorkoutShareData(state, ownerId).find(record => record.recordId === matchId) || null;
}
