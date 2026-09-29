export const SPORTS = ['tennis', 'futsal', 'running'];
export const SPORT_LABEL = { tennis: '테니스', futsal: '풋살', running: '러닝' };
export const LEVELS = ['입문', '초급', '중급', '상급', '무관'];
export const STORAGE_KEY = 'dwnc-local-demo-v1';

export class DomainError extends Error { constructor(message) { super(message); this.name = 'DomainError'; } }
const fail = (message) => { throw new DomainError(message); };
const clean = (value) => String(value ?? '').trim();
const clone = (state) => structuredClone(state);
const byId = (state, id) => state.users.find((user) => user.id === id);
const matchById = (state, id) => state.matches.find((match) => match.id === id);
const acceptedIds = (match) => [match.hostId, ...match.applications.filter((a) => a.status === 'accepted').map((a) => a.userId)];
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)) && new Date(`${value}T12:00:00`).toISOString().slice(0, 10) === value;
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const localDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayOffset = (base, offset) => { const date = new Date(`${base}T12:00:00`); date.setDate(date.getDate() + offset); return localDay(date); };

export function today() { return localDay(new Date()); }
export function getUser(state, id) { return byId(state, id); }
export function getMatch(state, id) { return matchById(state, id); }
export function participants(match) { return acceptedIds(match); }
export function openSeats(match) { return Math.max(0, match.capacity - acceptedIds(match).length); }
export function isCompleted(state, matchId) { return state.results.some((result) => result.matchId === matchId); }

export function createSeed(base = today()) {
  const users = [
    { id: 'minseo', name: '김민서', ageRange: '20대', gender: '여성', region: '관악구', bio: '테니스와 러닝으로 하루를 채워요. 편하게 함께해요!', manner: 4.9, sports: { tennis: { experience: '2년', level: '중급', preference: '단식', ntrp: '3.0' }, futsal: { experience: '1년', level: '초급', preference: '윙' }, running: { experience: '3년', level: '중급', preference: '5km' } } },
    { id: 'jihun', name: '박지훈', ageRange: '20대', gender: '남성', region: '관악구', bio: '퇴근 후 테니스 파트너를 찾습니다.', manner: 4.8, sports: { tennis: { experience: '4년', level: '중급', preference: '단식', ntrp: '3.5' }, futsal: { experience: '2년', level: '중급', preference: '미드필더' }, running: { experience: '1년', level: '초급', preference: '5km' } } },
    { id: 'sua', name: '최수아', ageRange: '30대', gender: '여성', region: '관악구', bio: '천천히 오래 뛰는 걸 좋아해요.', manner: 5.0, sports: { tennis: { experience: '1년', level: '초급', preference: '단식', ntrp: '2.5' }, futsal: { experience: '1년', level: '초급', preference: '수비' }, running: { experience: '5년', level: '상급', preference: '10km' } } },
    { id: 'hyunwoo', name: '정현우', ageRange: '20대', gender: '남성', region: '동작구', bio: '함께 뛰고 공 차는 시간을 좋아합니다.', manner: 4.7, sports: { tennis: { experience: '6개월', level: '입문', preference: '단식', ntrp: '2.0' }, futsal: { experience: '4년', level: '중급', preference: '수비' }, running: { experience: '2년', level: '중급', preference: '5km' } } }
  ];
  const matches = [
    { id: 'today-tennis', hostId: 'jihun', sport: 'tennis', title: '퇴근 후 가볍게 한 게임?', region: '관악구', venue: '관악구민운동장', date: base, startTime: '19:00', endTime: '20:30', capacity: 2, level: '중급', description: '단식 한 세트 즐겁게 치실 분을 찾습니다.', applications: [{ userId: 'minseo', status: 'accepted' }] },
    { id: 'today-open-tennis', hostId: 'sua', sport: 'tennis', title: '오늘 저녁 테니스 파트너 구해요', region: '관악구', venue: '신림체육센터', date: base, startTime: '20:30', endTime: '21:30', capacity: 2, level: '무관', description: '가볍게 단식 랠리하고 기록도 남겨요.', applications: [] },
    { id: 'weekend-futsal', hostId: 'hyunwoo', sport: 'futsal', title: '토요일 저녁 풋살 한 자리', region: '동작구', venue: '낙성대 풋살장', date: dayOffset(base, 3), startTime: '18:30', endTime: '20:00', capacity: 8, level: '중급', description: '친목 경기입니다. 수비 포지션 환영해요.', applications: [{ userId: 'jihun', status: 'accepted' }] },
    { id: 'weekend-run', hostId: 'sua', sport: 'running', title: '천천히 5K, 함께 뛰어요', region: '관악구', venue: '보라매공원', date: dayOffset(base, 4), startTime: '07:00', endTime: '08:00', capacity: 6, level: '무관', description: '대화할 수 있는 페이스로 달려요.', applications: [] },
    { id: 'morning-run', hostId: 'minseo', sport: 'running', title: '아침 5K 러닝', region: '관악구', venue: '보라매공원', date: base, startTime: '07:20', endTime: '08:00', capacity: 2, level: '무관', description: '아침 러닝 기록', applications: [{ userId: 'sua', status: 'accepted' }] },
    { id: 'past-tennis', hostId: 'minseo', sport: 'tennis', title: '관악 랠리', region: '관악구', venue: '관악구민운동장', date: dayOffset(base, -5), startTime: '18:00', endTime: '19:30', capacity: 2, level: '중급', description: '지난 경기 기록', applications: [{ userId: 'jihun', status: 'accepted' }] },
    { id: 'past-futsal', hostId: 'hyunwoo', sport: 'futsal', title: '동작 풋살', region: '동작구', venue: '낙성대 풋살장', date: dayOffset(base, -7), startTime: '19:00', endTime: '20:30', capacity: 3, level: '중급', description: '지난 경기 기록', applications: [{ userId: 'minseo', status: 'accepted' }, { userId: 'jihun', status: 'accepted' }] }
  ];
  const results = [
    { matchId: 'morning-run', recordedBy: 'minseo', sport: 'running', entries: { minseo: { distanceKm: 5.2, paceSec: 342 }, sua: { distanceKm: 5.2, paceSec: 330 } } },
    { matchId: 'past-tennis', recordedBy: 'minseo', sport: 'tennis', winnerId: 'minseo' },
    { matchId: 'past-futsal', recordedBy: 'hyunwoo', sport: 'futsal', teamOutcome: 'win', scoreFor: 3, scoreAgainst: 1, mvpUserId: 'hyunwoo' }
  ];
  return { version: 1, activeUserId: 'minseo', users, matches, results, nextId: 1 };
}

export function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.users) || !Array.isArray(state.matches) || !Array.isArray(state.results) || !Number.isInteger(state.nextId) || state.nextId < 1) return false;
  const text = (value) => typeof value === 'string';
  const ids = new Set();
  for (const user of state.users) {
    if (!user || !text(user.id) || !user.id || ids.has(user.id) || !text(user.name) || !text(user.region) || !text(user.bio) || !text(user.ageRange) || !text(user.gender) || !Number.isFinite(user.manner) || !user.sports) return false;
    ids.add(user.id);
    for (const sport of SPORTS) {
      const profile = user.sports[sport];
      if (!profile || !text(profile.experience) || !LEVELS.includes(profile.level) || !text(profile.preference) || (sport === 'tennis' && (!text(profile.ntrp) || !/^([1-6]\.[05]|7\.0)$/.test(profile.ntrp)))) return false;
    }
  }
  if (!ids.has(state.activeUserId)) return false;
  const matches = new Map();
  for (const match of state.matches) {
    if (!match || !text(match.id) || !match.id || matches.has(match.id) || !ids.has(match.hostId) || !SPORTS.includes(match.sport) || !text(match.title) || !text(match.region) || !text(match.venue) || !validDate(match.date) || !validTime(match.startTime) || !validTime(match.endTime) || match.startTime >= match.endTime || !Number.isInteger(match.capacity) || match.capacity < 2 || !LEVELS.includes(match.level) || !text(match.description) || !Array.isArray(match.applications)) return false;
    if (match.sport === 'tennis' && match.capacity !== 2) return false;
    const applicants = new Set();
    for (const application of match.applications) {
      if (!application || !ids.has(application.userId) || application.userId === match.hostId || applicants.has(application.userId) || !['pending', 'accepted', 'rejected'].includes(application.status)) return false;
      applicants.add(application.userId);
    }
    if (acceptedIds(match).length > match.capacity) return false;
    matches.set(match.id, match);
  }
  const resultIds = new Set();
  for (const result of state.results) {
    const match = matches.get(result?.matchId);
    if (!match || resultIds.has(result.matchId) || result.sport !== match.sport || !acceptedIds(match).includes(result.recordedBy)) return false;
    const participantIds = acceptedIds(match);
    if (result.sport === 'tennis' && (participantIds.length !== 2 || !participantIds.includes(result.winnerId))) return false;
    if (result.sport === 'futsal' && (!['win', 'loss', 'draw'].includes(result.teamOutcome) || !Number.isInteger(result.scoreFor) || !Number.isInteger(result.scoreAgainst) || result.scoreFor < 0 || result.scoreAgainst < 0 || Math.sign(result.scoreFor - result.scoreAgainst) !== (result.teamOutcome === 'win' ? 1 : result.teamOutcome === 'loss' ? -1 : 0) || !participantIds.includes(result.mvpUserId))) return false;
    if (result.sport === 'running' && (!result.entries || participantIds.some((id) => !result.entries[id] || !Number.isFinite(result.entries[id].distanceKm) || result.entries[id].distanceKm <= 0 || !Number.isInteger(result.entries[id].paceSec)))) return false;
    resultIds.add(result.matchId);
  }
  return true;
}

export function switchUser(state, userId) {
  if (!byId(state, userId)) fail('선택한 데모 사용자를 찾을 수 없습니다.');
  const next = clone(state); next.activeUserId = userId; return next;
}

export function updateProfile(state, userId, fields) {
  const next = clone(state); const user = byId(next, userId);
  if (!user) fail('프로필을 찾을 수 없습니다.');
  for (const key of ['name', 'region', 'bio', 'ageRange', 'gender']) {
    if (key in fields) user[key] = clean(fields[key]);
  }
  if (!user.name || !user.region || !user.ageRange) fail('이름, 연령대, 활동 지역을 입력해 주세요.');
  if (user.name.length > 24 || user.region.length > 30 || user.bio.length > 180) fail('프로필 입력 길이를 확인해 주세요.');
  if (fields.sports) for (const sport of SPORTS) {
    const input = fields.sports[sport]; if (!input) continue;
    user.sports[sport] = { experience: clean(input.experience), level: clean(input.level), preference: clean(input.preference), ...(sport === 'tennis' ? { ntrp: clean(input.ntrp) } : {}) };
    if (!user.sports[sport].experience || !LEVELS.includes(user.sports[sport].level) || !user.sports[sport].preference) fail(`${SPORT_LABEL[sport]} 정보를 모두 입력해 주세요.`);
    if (sport === 'tennis' && !/^([1-6]\.[05]|7\.0)$/.test(user.sports.tennis.ntrp)) fail('테니스 NTRP는 1.0~7.0 사이에서 0.5 단위로 입력해 주세요.');
  }
  return next;
}

export function createMatch(state, hostId, data, base = today()) {
  if (!byId(state, hostId)) fail('사용자를 찾을 수 없습니다.');
  const sport = clean(data.sport), title = clean(data.title), region = clean(data.region), venue = clean(data.venue), date = clean(data.date), startTime = clean(data.startTime), endTime = clean(data.endTime), level = clean(data.level), description = clean(data.description);
  const capacity = Number(data.capacity);
  if (!SPORTS.includes(sport)) fail('종목을 선택해 주세요.');
  if (!title || !region || !venue || !description) fail('제목, 지역, 장소, 설명을 모두 입력해 주세요.');
  if (title.length > 60 || region.length > 30 || venue.length > 60 || description.length > 500) fail('입력 가능한 글자 수를 확인해 주세요.');
  if (!validDate(date) || date < base) fail('오늘 또는 이후의 날짜를 선택해 주세요.');
  if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) fail('종료 시간을 시작 시간보다 늦게 설정해 주세요.');
  if (!LEVELS.includes(level)) fail('필요 수준을 선택해 주세요.');
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > (sport === 'running' ? 20 : 12) || (sport === 'tennis' && capacity !== 2)) fail(sport === 'tennis' ? '테니스 단식 정원은 2명입니다.' : '정원을 2명 이상으로 설정해 주세요.');
  const next = clone(state); const id = `match-${next.nextId++}`;
  next.matches.unshift({ id, hostId, sport, title, region, venue, date, startTime, endTime, capacity, level, description, applications: [] });
  return { state: next, id };
}

export function applyToMatch(state, matchId, userId) {
  const next = clone(state); const match = matchById(next, matchId);
  if (!match || !byId(next, userId)) fail('운동 자리 또는 사용자를 찾을 수 없습니다.');
  if (match.hostId === userId) fail('내가 만든 자리에는 신청할 수 없습니다.');
  if (isCompleted(next, matchId)) fail('이미 완료된 운동에는 신청할 수 없습니다.');
  if (match.applications.some((a) => a.userId === userId)) fail('이미 신청한 운동 자리입니다.');
  if (!openSeats(match)) fail('정원이 마감되었습니다.');
  match.applications.push({ userId, status: 'pending' }); return next;
}

export function decideApplication(state, matchId, hostId, applicantId, decision) {
  const next = clone(state); const match = matchById(next, matchId);
  if (!match) fail('운동 자리를 찾을 수 없습니다.');
  if (match.hostId !== hostId) fail('모집자만 신청을 결정할 수 있습니다.');
  if (isCompleted(next, matchId)) fail('완료된 운동은 변경할 수 없습니다.');
  const application = match.applications.find((a) => a.userId === applicantId);
  if (!application || application.status !== 'pending') fail('대기 중인 신청이 없습니다.');
  if (!['accepted', 'rejected'].includes(decision)) fail('수락 또는 거절을 선택해 주세요.');
  if (decision === 'accepted' && !openSeats(match)) fail('정원이 마감되었습니다.');
  application.status = decision; return next;
}

export function recordResult(state, matchId, userId, data) {
  const next = clone(state); const match = matchById(next, matchId);
  if (!match) fail('운동 자리를 찾을 수 없습니다.');
  if (isCompleted(next, matchId)) fail('이 운동의 결과는 이미 기록되었습니다.');
  const ids = acceptedIds(match);
  if (!ids.includes(userId)) fail('수락된 참가자와 모집자만 결과를 입력할 수 있습니다.');
  if (ids.length < 2) fail('참가자가 두 명 이상이어야 결과를 입력할 수 있습니다.');
  let result = { matchId, recordedBy: userId, sport: match.sport };
  if (match.sport === 'tennis') {
    if (ids.length !== 2 || !ids.includes(data.winnerId)) fail('두 참가자 중 승자를 선택해 주세요.');
    result.winnerId = data.winnerId;
  } else if (match.sport === 'futsal') {
    const scoreFor = Number(data.scoreFor), scoreAgainst = Number(data.scoreAgainst);
    if (!Number.isInteger(scoreFor) || !Number.isInteger(scoreAgainst) || scoreFor < 0 || scoreAgainst < 0 || scoreFor > 99 || scoreAgainst > 99) fail('풋살 스코어를 0~99 사이로 입력해 주세요.');
    const teamOutcome = scoreFor > scoreAgainst ? 'win' : scoreFor < scoreAgainst ? 'loss' : 'draw';
    if (!ids.includes(data.mvpUserId)) fail('참가자 중 MVP를 선택해 주세요.');
    result.teamOutcome = teamOutcome; result.scoreFor = scoreFor; result.scoreAgainst = scoreAgainst; result.mvpUserId = data.mvpUserId;
  } else {
    const entries = {};
    for (const id of ids) {
      const distanceKm = Number(data.entries?.[id]?.distanceKm);
      const paceSec = Number(data.entries?.[id]?.paceSec);
      if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 200 || !Number.isInteger(paceSec) || paceSec < 120 || paceSec > 1800) fail('모든 참가자의 거리와 페이스를 확인해 주세요.');
      entries[id] = { distanceKm, paceSec };
    }
    result.entries = entries;
  }
  next.results.push(result); return next;
}

export function activityFor(state, userId, date = today()) {
  return state.matches.filter((match) => match.date === date && acceptedIds(match).includes(userId)).map((match) => ({ match, result: state.results.find((result) => result.matchId === match.id) || null })).sort((a, b) => a.match.startTime.localeCompare(b.match.startTime));
}

export function statsFor(state, userId, { sport, region, venue } = {}) {
  const stats = { tennis: { games: 0, wins: 0, losses: 0, winRate: 0 }, futsal: { games: 0, wins: 0, losses: 0, draws: 0, mvp: 0 }, running: { runs: 0, distanceKm: 0, paceSec: 0 } };
  let runSeconds = 0, runDistance = 0;
  for (const result of state.results) {
    const match = matchById(state, result.matchId);
    if (!match || (sport && match.sport !== sport) || (region && match.region !== region) || (venue && match.venue !== venue) || !acceptedIds(match).includes(userId)) continue;
    if (match.sport === 'tennis') { stats.tennis.games++; if (result.winnerId === userId) stats.tennis.wins++; else stats.tennis.losses++; }
    if (match.sport === 'futsal') { stats.futsal.games++; if (result.teamOutcome === 'win') stats.futsal.wins++; else if (result.teamOutcome === 'loss') stats.futsal.losses++; else stats.futsal.draws++; if (result.mvpUserId === userId) stats.futsal.mvp++; }
    if (match.sport === 'running' && result.entries[userId]) { const entry = result.entries[userId]; stats.running.runs++; stats.running.distanceKm += entry.distanceKm; runSeconds += entry.paceSec * entry.distanceKm; runDistance += entry.distanceKm; }
  }
  stats.tennis.winRate = stats.tennis.games ? Math.round(100 * stats.tennis.wins / stats.tennis.games) : 0;
  stats.running.distanceKm = Math.round(stats.running.distanceKm * 10) / 10;
  stats.running.paceSec = runDistance ? Math.round(runSeconds / runDistance) : 0;
  return stats;
}

export function ranking(state, sport, scope = {}) {
  if (!SPORTS.includes(sport)) return [];
  const rows = state.users.map((user) => ({ user, stats: statsFor(state, user.id, { sport, ...scope }) })).filter(({ stats }) => sport === 'tennis' ? stats.tennis.games : sport === 'futsal' ? stats.futsal.games : stats.running.runs);
  rows.sort((a, b) => sport === 'tennis' ? b.stats.tennis.winRate - a.stats.tennis.winRate || b.stats.tennis.games - a.stats.tennis.games || a.user.name.localeCompare(b.user.name) : sport === 'futsal' ? b.stats.futsal.mvp - a.stats.futsal.mvp || b.stats.futsal.wins - a.stats.futsal.wins || b.stats.futsal.games - a.stats.futsal.games : a.stats.running.paceSec - b.stats.running.paceSec || b.stats.running.distanceKm - a.stats.running.distanceKm);
  return rows;
}

export function filterMatches(state, filters = {}) {
  const query = clean(filters.query).toLocaleLowerCase();
  return state.matches.filter((match) => {
    if (filters.sport && match.sport !== filters.sport) return false;
    if (filters.region && match.region !== filters.region) return false;
    if (filters.venue && !match.venue.toLocaleLowerCase().includes(clean(filters.venue).toLocaleLowerCase())) return false;
    if (filters.date && match.date !== filters.date) return false;
    if (filters.level && filters.level !== '무관' && match.level !== '무관' && match.level !== filters.level) return false;
    if (filters.time && (filters.time === 'morning' ? match.startTime >= '12:00' : filters.time === 'afternoon' ? match.startTime < '12:00' || match.startTime >= '18:00' : match.startTime < '18:00')) return false;
    if (filters.openOnly && (!openSeats(match) || isCompleted(state, match.id))) return false;
    if (query && !`${match.title} ${match.region} ${match.venue} ${match.description}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}
