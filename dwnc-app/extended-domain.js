import * as base from './domain.js';

export const AVATARS = ['✳', '◎', '↗', '✦', '◉', '★'];
export const VISIBILITY = ['public', 'friends', 'group'];
export const VISIBILITY_LABEL = { public: '전체 공개', friends: '친구 공개', group: '그룹 공개' };
export const FORMAT_LABEL = { singles: '단식', doubles: '복식', team: '팀 경기', crew: '러닝 크루' };
const clone = (value) => structuredClone(value);
const clean = (value) => String(value ?? '').trim();
const fail = (message) => { throw new base.DomainError(message); };
const uid = (state, id) => state.users.find((user) => user.id === id);
const mid = (state, id) => state.matches.find((match) => match.id === id);
const gid = (state, id) => state.groups.find((group) => group.id === id);
const ids = (match) => base.participants(match);
const unique = (values) => [...new Set(values)];
const formatFor = (sport) => ({ tennis: 'singles', futsal: 'team', running: 'crew' }[sport]);
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`)) && new Date(`${value}T12:00:00`).toISOString().slice(0, 10) === value;
const validPace = (value) => Number.isInteger(value) && value >= 120 && value <= 1800;
const validDistance = (value) => Number.isFinite(value) && value > 0 && value <= 200;
const sameSet = (left, right) => left.length === right.length && left.every((id) => right.includes(id));
const nextId = (state, prefix) => { let id; do { id = `${prefix}-${state.nextId++}`; } while (state.matches.some((m) => m.id === id) || state.users.some((u) => u.id === id) || state.groups.some((g) => g.id === id) || state.friendRequests.some((r) => r.id === id) || state.invitations.some((i) => i.id === id) || state.notifications.some((n) => n.id === id)); return id; };
const notify = (state, userId, text, route = '#/home') => state.notifications.unshift({ id: nextId(state, 'notice'), userId, text, route, read: false, at: new Date().toISOString() });
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const matchRoute = (id) => `#/activity?match=${encodeURIComponent(id)}`;
const validCode = (value) => /^DWNC-[A-Z0-9-]{3,30}$/.test(value);

export function strictLegacy(state) {
  if (!base.validateState(state)) return false;
  for (const result of state.results) {
    if (result.sport !== 'running') continue;
    const match = mid(state, result.matchId);
    if (!match || !sameSet(Object.keys(result.entries || {}), ids(match))) return false;
    if (Object.values(result.entries).some((entry) => !validDistance(entry.distanceKm) || !validPace(entry.paceSec))) return false;
  }
  return true;
}

export function migrateV1(legacy) {
  if (!strictLegacy(legacy)) fail('이전 데모 데이터가 손상되어 자동 이전할 수 없습니다.');
  const state = clone(legacy);
  state.version = 2;
  state.groups = []; state.friendRequests = []; state.invitations = []; state.notifications = []; state.dailyNotes = {}; state.ratings = [];
  state.users.forEach((user, index) => {
    user.avatar = AVATARS[index % AVATARS.length];
    user.photo = null;
    user.chosenSports = [...base.SPORTS];
    user.friendCode = `DWNC-${String(index + 1).padStart(4, '0')}`;
  });
  state.matches.forEach((match) => { match.format = formatFor(match.sport); match.visibility = 'public'; match.groupId = null; match.status = 'open'; });
  state.results.forEach((result) => {
    const match = mid(state, result.matchId);
    result.attendedIds = ids(match);
    if (result.sport === 'tennis') { result.teams = [[result.winnerId], ids(match).filter((id) => id !== result.winnerId)]; result.winnerTeam = 0; result.scoreA = null; result.scoreB = null; }
    if (result.sport === 'futsal') { result.positions = {}; }
    if (result.sport === 'running') { result.reviews = {}; }
  });
  const used = [...state.matches.map((m) => m.id), ...state.users.map((u) => u.id)].map((id) => Number(/-(\d+)$/.exec(id)?.[1] || 0));
  state.nextId = Math.max(state.nextId, ...used, 0) + 1;
  if (!validateV2(state)) fail('이전 데모 데이터를 검증할 수 없습니다.');
  return state;
}

export function createExtendedSeed(date = base.today()) {
  const state = migrateV1(base.createSeed(date));
  state.groups.push({ id: 'group-motion', ownerId: 'minseo', name: '관악 모션 클럽', region: '관악구', description: '운동 종목을 넘나들며 같이 움직여요.', memberIds: ['minseo', 'sua'] });
  state.friendRequests.push({ id: 'friend-seed', fromId: 'minseo', toId: 'jihun', status: 'accepted' });
  return state;
}

export function validateV2(state) {
  if (!state || state.version !== 2 || !Array.isArray(state.users) || !Array.isArray(state.matches) || !Array.isArray(state.results) || !Array.isArray(state.groups) || !Array.isArray(state.friendRequests) || !Array.isArray(state.invitations) || !Array.isArray(state.notifications) || !Array.isArray(state.ratings) || !plainObject(state.dailyNotes) || !Number.isInteger(state.nextId) || state.nextId < 1) return false;
  const userIds = new Set(); const codes = new Set();
  for (const user of state.users) {
    if (!user || typeof user.id !== 'string' || !user.id || userIds.has(user.id) || typeof user.name !== 'string' || !user.name || typeof user.region !== 'string' || !user.region || typeof user.ageRange !== 'string' || typeof user.gender !== 'string' || typeof user.bio !== 'string' || !Number.isFinite(user.manner) || !AVATARS.includes(user.avatar) || !(user.photo === null || typeof user.photo === 'string' && user.photo.length <= 200000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(user.photo)) || !validCode(user.friendCode) || codes.has(user.friendCode) || !Array.isArray(user.chosenSports) || !user.chosenSports.length || !sameSet(user.chosenSports, unique(user.chosenSports)) || user.chosenSports.some((sport) => !base.SPORTS.includes(sport)) || !user.sports) return false;
    for (const sport of base.SPORTS) {
      const profile = user.sports[sport];
      if (!profile || typeof profile.experience !== 'string' || !base.LEVELS.includes(profile.level) || typeof profile.preference !== 'string' || (sport === 'tennis' && !/^([1-6]\.[05]|7\.0)$/.test(profile.ntrp))) return false;
    }
    userIds.add(user.id); codes.add(user.friendCode);
  }
  if (!userIds.has(state.activeUserId)) return false;
  for (const [userId, notes] of Object.entries(state.dailyNotes)) {
    if (!userIds.has(userId) || !plainObject(notes)) return false;
    for (const [date, text] of Object.entries(notes)) if (!validDate(date) || typeof text !== 'string' || text.length > 140) return false;
  }
  const groupIds = new Set();
  for (const group of state.groups) {
    if (!group || typeof group.id !== 'string' || !group.id || groupIds.has(group.id) || !userIds.has(group.ownerId) || typeof group.name !== 'string' || !group.name || typeof group.region !== 'string' || typeof group.description !== 'string' || !Array.isArray(group.memberIds) || !group.memberIds.includes(group.ownerId) || !sameSet(group.memberIds, unique(group.memberIds)) || group.memberIds.some((id) => !userIds.has(id))) return false;
    groupIds.add(group.id);
  }
  const matchIds = new Set();
  for (const match of state.matches) {
    if (!match || typeof match.id !== 'string' || !match.id || matchIds.has(match.id) || !userIds.has(match.hostId) || !base.SPORTS.includes(match.sport) || typeof match.title !== 'string' || !match.title || typeof match.region !== 'string' || !match.region || typeof match.venue !== 'string' || !match.venue || !validDate(match.date) || !validTime(match.startTime) || !validTime(match.endTime) || match.startTime >= match.endTime || !Number.isInteger(match.capacity) || match.capacity < 2 || !base.LEVELS.includes(match.level) || typeof match.description !== 'string' || !Array.isArray(match.applications) || !VISIBILITY.includes(match.visibility) || !['open', 'cancelled'].includes(match.status) || match.format !== formatFor(match.sport) && !(match.sport === 'tennis' && match.format === 'doubles')) return false;
    if (match.sport === 'tennis' && match.capacity !== (match.format === 'doubles' ? 4 : 2)) return false;
    if (match.visibility === 'group' && (!groupIds.has(match.groupId) || !gid(state, match.groupId).memberIds.includes(match.hostId))) return false;
    if (match.visibility !== 'group' && match.groupId !== null) return false;
    const applicants = new Set();
    for (const application of match.applications) {
      if (!application || !userIds.has(application.userId) || application.userId === match.hostId || applicants.has(application.userId) || !['pending', 'accepted', 'rejected', 'expired'].includes(application.status)) return false;
      applicants.add(application.userId);
    }
    if (ids(match).length > match.capacity) return false;
    matchIds.add(match.id);
  }
  const resultIds = new Set();
  for (const result of state.results) {
    const match = mid(state, result?.matchId);
    if (!match || resultIds.has(result.matchId) || result.sport !== match.sport || !ids(match).includes(result.recordedBy) || !Array.isArray(result.attendedIds) || !sameSet(result.attendedIds, unique(result.attendedIds)) || result.attendedIds.some((id) => !ids(match).includes(id))) return false;
    if (result.sport === 'tennis') {
      if (result.noContest) { if (result.attendedIds.length === match.capacity) return false; }
      else if (!Array.isArray(result.teams) || result.teams.length !== 2 || result.teams.some((team) => !Array.isArray(team)) || ![0, 1].includes(result.winnerTeam) || !sameSet(result.teams.flat(), result.attendedIds) || result.teams[0].some((id) => result.teams[1].includes(id)) || result.teams.some((team) => team.length !== (match.format === 'doubles' ? 2 : 1)) || (result.scoreA !== null && (!Number.isInteger(result.scoreA) || !Number.isInteger(result.scoreB) || result.scoreA < 0 || result.scoreB < 0 || result.scoreA === result.scoreB || (result.scoreA > result.scoreB ? 0 : 1) !== result.winnerTeam))) return false;
    }
    if (result.sport === 'futsal' && (result.attendedIds.length < 2 || !['win', 'loss', 'draw'].includes(result.teamOutcome) || !Number.isInteger(result.scoreFor) || !Number.isInteger(result.scoreAgainst) || result.scoreFor < 0 || result.scoreAgainst < 0 || Math.sign(result.scoreFor - result.scoreAgainst) !== (result.teamOutcome === 'win' ? 1 : result.teamOutcome === 'loss' ? -1 : 0) || !result.attendedIds.includes(result.mvpUserId) || !result.positions || typeof result.positions !== 'object')) return false;
    if (result.sport === 'running' && (result.attendedIds.length < 1 || !result.entries || !result.reviews || !sameSet(Object.keys(result.entries), result.attendedIds) || Object.values(result.entries).some((entry) => !validDistance(entry.distanceKm) || !validPace(entry.paceSec)))) return false;
    resultIds.add(result.matchId);
  }
  for (const request of state.friendRequests) if (!request || !userIds.has(request.fromId) || !userIds.has(request.toId) || request.fromId === request.toId || !['pending', 'accepted', 'rejected'].includes(request.status)) return false;
  for (const invitation of state.invitations) if (!invitation || !userIds.has(invitation.fromId) || !userIds.has(invitation.toId) || !matchIds.has(invitation.matchId) || !['pending', 'accepted', 'declined', 'expired'].includes(invitation.status)) return false;
  for (const notice of state.notifications) if (!notice || !userIds.has(notice.userId) || typeof notice.text !== 'string' || typeof notice.route !== 'string' || typeof notice.read !== 'boolean') return false;
  for (const rating of state.ratings) {
    const result = state.results.find((item) => item.matchId === rating?.matchId);
    if (!result || !result.attendedIds.includes(rating.fromId) || !result.attendedIds.includes(rating.toId) || rating.fromId === rating.toId || !Number.isInteger(rating.value) || rating.value < 1 || rating.value > 5) return false;
  }
  return true;
}

export function switchDemoUser(state, userId) { return base.switchUser(state, userId); }
export function createDemoUser(state, data) {
  const name = clean(data.name), region = clean(data.region), ageRange = clean(data.ageRange), gender = clean(data.gender), bio = clean(data.bio);
  const chosenSports = unique(data.chosenSports || []);
  if (!name || !region || !ageRange || name.length > 24 || region.length > 30 || bio.length > 180 || !chosenSports.length || chosenSports.some((sport) => !base.SPORTS.includes(sport))) fail('이름, 연령대, 지역과 한 가지 이상 종목을 확인해 주세요.');
  if (!AVATARS.includes(data.avatar)) fail('프로필 아이콘을 선택해 주세요.');
  const next = clone(state); const id = nextId(next, 'user');
  const code = `DWNC-U${id.split('-').at(-1).padStart(4, '0')}`;
  const sports = { tennis: { experience: '입문', level: '입문', preference: '단식', ntrp: '1.0' }, futsal: { experience: '입문', level: '입문', preference: '미정' }, running: { experience: '입문', level: '입문', preference: '5km' } };
  next.users.push({ id, friendCode: code, name, region, ageRange, gender, bio, avatar: data.avatar, photo: null, chosenSports, manner: 4.5, sports });
  next.activeUserId = id;
  return { state: next, id };
}
export function editProfile(state, userId, data) {
  const next = base.updateProfile(state, userId, data);
  const user = uid(next, userId);
  if (data.avatar !== undefined) { if (!AVATARS.includes(data.avatar)) fail('프로필 아이콘을 선택해 주세요.'); user.avatar = data.avatar; }
  if (data.chosenSports !== undefined) { const chosen = unique(data.chosenSports); if (!chosen.length || chosen.some((sport) => !base.SPORTS.includes(sport))) fail('즐기는 종목을 한 가지 이상 선택해 주세요.'); user.chosenSports = chosen; }
  return next;
}
export function setProfilePhoto(state, userId, dataUrl) {
  if (!uid(state, userId)) fail('사용자를 찾을 수 없습니다.');
  if (!(dataUrl === null || typeof dataUrl === 'string' && dataUrl.length <= 200000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl))) fail('프로필 사진 형식이나 크기를 확인해 주세요.');
  const next = clone(state); uid(next, userId).photo = dataUrl; return next;
}
export function friendsOf(state, userId) { return unique(state.friendRequests.filter((request) => request.status === 'accepted' && [request.fromId, request.toId].includes(userId)).map((request) => request.fromId === userId ? request.toId : request.fromId)); }
export function sendFriendRequest(state, fromId, code) {
  const target = state.users.find((user) => user.friendCode.toUpperCase() === clean(code).toUpperCase());
  if (!uid(state, fromId) || !target) fail('해당 친구 코드를 찾을 수 없습니다.');
  if (target.id === fromId) fail('내 코드로는 친구 신청할 수 없습니다.');
  if (state.friendRequests.some((request) => [request.fromId, request.toId].includes(fromId) && [request.fromId, request.toId].includes(target.id) && request.status !== 'rejected')) fail('이미 친구이거나 신청 중입니다.');
  const next = clone(state); next.friendRequests.push({ id: nextId(next, 'friend'), fromId, toId: target.id, status: 'pending' });
  notify(next, target.id, `${uid(next, fromId).name}님이 친구를 신청했습니다.`, '#/people'); return next;
}
export function decideFriendRequest(state, requestId, userId, decision) {
  const next = clone(state); const request = next.friendRequests.find((item) => item.id === requestId);
  if (!request || request.toId !== userId || request.status !== 'pending' || !['accepted', 'rejected'].includes(decision)) fail('처리할 수 없는 친구 신청입니다.');
  request.status = decision; notify(next, request.fromId, `${uid(next, userId).name}님이 친구 신청을 ${decision === 'accepted' ? '수락' : '거절'}했습니다.`, '#/people'); return next;
}
export function createGroup(state, ownerId, data) {
  const name = clean(data.name), region = clean(data.region), description = clean(data.description);
  if (!uid(state, ownerId) || !name || !region || name.length > 40 || region.length > 30 || description.length > 300) fail('그룹 이름과 지역, 설명 길이를 확인해 주세요.');
  const next = clone(state); const id = nextId(next, 'group'); next.groups.push({ id, ownerId, name, region, description, memberIds: [ownerId] }); return { state: next, id };
}
export function joinGroup(state, groupId, userId) {
  const next = clone(state); const group = gid(next, groupId);
  if (!group || !uid(next, userId)) fail('그룹 또는 사용자를 찾을 수 없습니다.');
  if (group.memberIds.includes(userId)) fail('이미 가입한 그룹입니다.');
  group.memberIds.push(userId); notify(next, group.ownerId, `${uid(next, userId).name}님이 ${group.name}에 가입했습니다.`, `#/groups`); return next;
}
export function canViewMatch(state, match, userId) {
  if (!match || !uid(state, userId)) return false;
  if (match.hostId === userId || match.applications.some((a) => a.userId === userId)) return true;
  if (match.status === 'cancelled') return false;
  if (match.visibility === 'public') return true;
  if (match.visibility === 'friends') return friendsOf(state, match.hostId).includes(userId);
  return Boolean(gid(state, match.groupId)?.memberIds.includes(userId));
}
export function visibleMatches(state, userId) { return state.matches.filter((match) => canViewMatch(state, match, userId)); }
// Shared eligibility for discovery, detail buttons and mutations.
export function recruitmentClosed(match, now = new Date()) {
  if (!match) return true;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return match.date < day || match.date === day && match.endTime <= time;
}
export function canRequestMatch(state, match, userId, now = new Date()) {
  return canViewMatch(state, match, userId) && match.status === 'open' &&
    !base.isCompleted(state, match.id) && !recruitmentClosed(match, now) &&
    match.hostId !== userId && !match.applications.some(a => a.userId === userId) && base.openSeats(match) > 0;
}
function closePending(state, match, reason) {
  for (const application of match.applications.filter(a => a.status === 'pending')) {
    application.status = 'rejected';
    application.closedReason = reason;
    notify(state, application.userId, `${match.title}: ${reason}로 신청이 종료됐습니다.`, matchRoute(match.id));
  }
  for (const invitation of state.invitations.filter(i => i.matchId === match.id && i.status === 'pending')) {
    invitation.status = 'expired';
    notify(state, invitation.toId, `${match.title}: ${reason}로 초대가 종료됐습니다.`, matchRoute(match.id));
  }
}
export function reconcileRequests(state) {
  const next = clone(state);
  for (const match of next.matches) {
    for (const application of match.applications) if (application.status === 'expired') {
      application.status = 'rejected'; application.closedReason ||= match.status === 'cancelled' ? '자리 취소' : '운동 완료';
    }
    if (match.status === 'cancelled' || base.isCompleted(next, match.id))
      closePending(next, match, match.status === 'cancelled' ? '자리 취소' : '운동 완료');
  }
  return next;
}
export function makeMatch(state, hostId, data, date = base.today()) {
  const sport = clean(data.sport), format = clean(data.format) || formatFor(sport), visibility = clean(data.visibility) || 'public';
  if (!base.SPORTS.includes(sport) || !VISIBILITY.includes(visibility) || format !== formatFor(sport) && !(sport === 'tennis' && format === 'doubles')) fail('종목, 방식 또는 공개 범위를 확인해 주세요.');
  const groupId = visibility === 'group' ? clean(data.groupId) : null;
  if (visibility === 'group' && !gid(state, groupId)?.memberIds.includes(hostId)) fail('가입한 그룹의 자리만 만들 수 있습니다.');
  const capacity = Number(data.capacity);
  if (sport === 'tennis' && capacity !== (format === 'doubles' ? 4 : 2)) fail(format === 'doubles' ? '테니스 복식 정원은 4명입니다.' : '테니스 단식 정원은 2명입니다.');
  const legacyCapacity = sport === 'tennis' ? 2 : capacity;
  const made = base.createMatch(state, hostId, { ...data, capacity: legacyCapacity }, date);
  const match = mid(made.state, made.id);
  match.capacity = capacity; match.format = format; match.visibility = visibility; match.groupId = groupId; match.status = 'open';
  return made;
}
export function requestMatch(state, matchId, userId, now = new Date()) {
  const match = mid(state, matchId);
  if (!canViewMatch(state, match, userId)) fail('볼 수 없는 운동 자리입니다.');
  if (match.status !== 'open') fail('취소된 운동 자리에는 신청할 수 없습니다.');
  if (recruitmentClosed(match, now)) fail('모집 시간이 종료된 운동입니다. 다른 자리를 찾아 주세요.');
  const next = base.applyToMatch(state, matchId, userId);
  const invitation = next.invitations.find((item) => item.matchId === matchId && item.toId === userId && item.status === 'pending');
  if (invitation) { invitation.status = 'accepted'; mid(next, matchId).applications.find((a) => a.userId === userId).status = 'accepted'; notify(next, match.hostId, `${uid(next, userId).name}님이 ${match.title} 초대를 수락했습니다.`, matchRoute(match.id)); }
  else notify(next, match.hostId, `${uid(next, userId).name}님이 ${match.title}에 신청했습니다.`, matchRoute(match.id));
  return next;
}
export function decideMatchRequest(state, matchId, hostId, applicantId, decision, now = new Date()) {
  const match = mid(state, matchId); if (!match || match.status !== 'open') fail('취소된 운동 자리입니다.');
  if (decision === 'accepted' && recruitmentClosed(match, now)) fail('모집 시간이 종료된 운동입니다.');
  const next = base.decideApplication(state, matchId, hostId, applicantId, decision);
  for (const invitation of next.invitations.filter((item) => item.matchId === matchId && item.toId === applicantId && item.status === 'pending')) invitation.status = decision === 'accepted' ? 'accepted' : 'declined';
  notify(next, applicantId, `${match.title} 참여 신청이 ${decision === 'accepted' ? '수락' : '거절'}됐습니다.`, matchRoute(match.id)); return next;
}
export function withdrawMatch(state, matchId, userId) {
  const next = clone(state); const match = mid(next, matchId);
  if (!match || match.hostId === userId || base.isCompleted(next, matchId) || match.status !== 'open') fail('이 자리에서는 신청을 철회할 수 없습니다.');
  const index = match.applications.findIndex((a) => a.userId === userId && ['pending', 'accepted'].includes(a.status));
  if (index < 0) fail('철회할 신청이 없습니다.');
  match.applications.splice(index, 1); notify(next, match.hostId, `${uid(next, userId).name}님이 ${match.title} 참여를 철회했습니다.`, matchRoute(match.id)); return next;
}
export function cancelMatch(state, matchId, hostId) {
  const next = clone(state); const match = mid(next, matchId);
  if (!match || match.hostId !== hostId || match.status !== 'open' || base.isCompleted(next, matchId)) fail('모집자만 완료 전 자리를 취소할 수 있습니다.');
  match.status = 'cancelled';
  closePending(next, match, '자리 취소');
  const affected = match.applications.filter(a => a.status === 'accepted').map(a => a.userId);
  for (const id of affected) notify(next, id, `${match.title} 운동 자리가 취소됐습니다.`, matchRoute(match.id));
  return next;
}
export function inviteToMatch(state, matchId, fromId, toId, now = new Date()) {
  const next = clone(state); const match = mid(next, matchId);
  if (!match || recruitmentClosed(match, now) || match.hostId !== fromId || match.status !== 'open' || base.isCompleted(next, matchId) || !uid(next, toId) || !friendsOf(next, fromId).includes(toId) || !canViewMatch(next, match, toId) || !base.openSeats(match) || match.applications.some((a) => a.userId === toId)) fail('이 친구를 해당 운동에 초대할 수 없습니다.');
  if (next.invitations.some((i) => i.matchId === matchId && i.toId === toId && i.status === 'pending')) fail('이미 초대한 친구입니다.');
  const id = nextId(next, 'invite'); next.invitations.push({ id, matchId, fromId, toId, status: 'pending' });
  notify(next, toId, `${uid(next, fromId).name}님이 ${match.title}에 초대했습니다.`, '#/people'); return next;
}
export function decideInvitation(state, invitationId, userId, decision, now = new Date()) {
  const next = clone(state); const invitation = next.invitations.find((item) => item.id === invitationId);
  if (!invitation || invitation.toId !== userId || invitation.status !== 'pending' || !['accepted', 'declined'].includes(decision)) fail('처리할 수 없는 운동 초대입니다.');
  const match = mid(next, invitation.matchId);
  if (decision === 'accepted') {
    if (!match || recruitmentClosed(match, now) || match.status !== 'open' || base.isCompleted(next, match.id) || !canViewMatch(next, match, userId) || !base.openSeats(match) || match.applications.some((a) => a.userId === userId)) fail('이 초대는 더 이상 수락할 수 없습니다.');
    match.applications.push({ userId, status: 'accepted' });
  }
  invitation.status = decision;
  notify(next, invitation.fromId, `${uid(next, userId).name}님이 ${match.title} 초대를 ${decision === 'accepted' ? '수락' : '거절'}했습니다.`, matchRoute(match.id));
  return next;
}

export function saveResult(state, matchId, actorId, data) {
  const next = clone(state); const match = mid(next, matchId);
  if (!match || match.status !== 'open' || base.isCompleted(next, matchId)) fail('결과를 입력할 수 없는 운동입니다.');
  const accepted = ids(match); if (!accepted.includes(actorId)) fail('확정 참가자만 결과를 기록할 수 있습니다.');
  const attendedIds = unique(data.attendedIds || []);
  if (!attendedIds.length || attendedIds.some((id) => !accepted.includes(id))) fail('실제 참가자를 확인해 주세요.');
  const result = { matchId, sport: match.sport, recordedBy: actorId, attendedIds };
  if (match.sport === 'tennis') {
    const teamSize = match.format === 'doubles' ? 2 : 1;
    if (attendedIds.length !== match.capacity) {
      if (!data.noContest) fail('테니스 경기 인원이 부족합니다. 경기 미성립으로 기록해 주세요.');
      result.noContest = true;
    } else {
      const teamA = unique(data.teamAIds || []), teamB = accepted.filter((id) => !teamA.includes(id));
      const scoreA = Number(data.scoreA), scoreB = Number(data.scoreB);
      if (teamA.length !== teamSize || teamB.length !== teamSize || !sameSet([...teamA, ...teamB], attendedIds)) fail('두 팀의 참가자를 겹치지 않게 선택해 주세요.');
      if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA > 99 || scoreB > 99 || scoreA === scoreB) fail('무승부가 아닌 유효한 테니스 스코어를 입력해 주세요.');
      result.teams = [teamA, teamB]; result.scoreA = scoreA; result.scoreB = scoreB; result.winnerTeam = scoreA > scoreB ? 0 : 1;
    }
  } else if (match.sport === 'futsal') {
    if (attendedIds.length < 2) fail('풋살 참가자가 두 명 이상이어야 합니다.');
    const scoreFor = Number(data.scoreFor), scoreAgainst = Number(data.scoreAgainst);
    if (!Number.isInteger(scoreFor) || !Number.isInteger(scoreAgainst) || scoreFor < 0 || scoreAgainst < 0 || scoreFor > 99 || scoreAgainst > 99) fail('풋살 스코어를 0~99 사이로 입력해 주세요.');
    if (!attendedIds.includes(data.mvpUserId)) fail('실제 참가자 중 MVP를 선택해 주세요.');
    const positions = {};
    for (const id of attendedIds) { positions[id] = clean(data.positions?.[id]); if (!positions[id] || positions[id].length > 30) fail('실제 참가자의 포지션을 입력해 주세요.'); }
    result.scoreFor = scoreFor; result.scoreAgainst = scoreAgainst; result.teamOutcome = scoreFor > scoreAgainst ? 'win' : scoreFor < scoreAgainst ? 'loss' : 'draw'; result.mvpUserId = data.mvpUserId; result.positions = positions;
  } else {
    const entries = {}, reviews = {};
    for (const id of attendedIds) {
      const distanceKm = Number(data.entries?.[id]?.distanceKm), paceSec = Number(data.entries?.[id]?.paceSec);
      if (!validDistance(distanceKm) || !validPace(paceSec)) fail('실제 러닝 참가자의 거리와 페이스를 확인해 주세요.');
      entries[id] = { distanceKm, paceSec }; reviews[id] = clean(data.reviews?.[id]);
      if (reviews[id].length > 160) fail('러닝 후기는 160자 이내로 적어 주세요.');
    }
    result.entries = entries; result.reviews = reviews;
  }
  next.results.push(result);
  closePending(next, match, '운동 완료');
  for (const id of attendedIds.filter((id) => id !== actorId)) notify(next, id, `${match.title} 결과가 기록됐습니다.`, matchRoute(match.id));
  return next;
}
export function rateParticipant(state, matchId, fromId, toId, value) {
  const next = clone(state); const result = next.results.find((item) => item.matchId === matchId);
  const rating = Number(value);
  if (!result || !result.attendedIds.includes(fromId) || !result.attendedIds.includes(toId) || fromId === toId || !Number.isInteger(rating) || rating < 1 || rating > 5) fail('실제 함께 운동한 다른 참가자에게 1~5점을 남길 수 있습니다.');
  if (next.ratings.some((item) => item.matchId === matchId && item.fromId === fromId && item.toId === toId)) fail('이미 이 참가자를 평가했습니다.');
  next.ratings.push({ matchId, fromId, toId, value: rating }); notify(next, toId, `${uid(next, fromId).name}님이 함께한 운동의 매너 평가를 남겼습니다.`, matchRoute(matchId)); return next;
}
export function mannerFor(state, userId) {
  const user = uid(state, userId); if (!user) return 0;
  const values = state.ratings.filter((rating) => rating.toId === userId).map((rating) => rating.value);
  return Math.round((user.manner * 5 + values.reduce((sum, value) => sum + value, 0)) / (5 + values.length) * 10) / 10;
}
export function setDailyNote(state, userId, date, text) {
  if (!uid(state, userId) || !validDate(date) || clean(text).length > 140) fail('오늘의 한 줄은 140자 이내로 적어 주세요.');
  if (!plainObject(state.dailyNotes) || (Object.hasOwn(state.dailyNotes, userId) && !plainObject(state.dailyNotes[userId]))) fail('오늘 기록의 저장 형식이 올바르지 않습니다.');
  const next = clone(state); next.dailyNotes[userId] ||= {}; next.dailyNotes[userId][date] = clean(text); return next;
}
export function markNoticeRead(state, noticeId, userId) {
  const next = clone(state); const notice = next.notifications.find((item) => item.id === noticeId);
  if (!notice || notice.userId !== userId) fail('알림을 찾을 수 없습니다.');
  notice.read = true; return next;
}
export function markAllNoticesRead(state, userId) {
  const next = clone(state); next.notifications.filter((notice) => notice.userId === userId).forEach((notice) => { notice.read = true; }); return next;
}

export function activityFor(state, userId, date = base.today()) {
  return state.matches.filter((match) => match.date === date && match.status !== 'cancelled' && ids(match).includes(userId)).map((match) => ({ match, result: state.results.find((result) => result.matchId === match.id) || null })).sort((a, b) => a.match.startTime.localeCompare(b.match.startTime));
}
export function statsFor(state, userId, { sport, region, venue, groupId, period = 'all', month = base.today().slice(0, 7) } = {}) {
  const stats = { tennis: { games: 0, wins: 0, losses: 0, winRate: 0 }, futsal: { games: 0, wins: 0, losses: 0, draws: 0, mvp: 0 }, running: { runs: 0, distanceKm: 0, paceSec: 0 } };
  let runSeconds = 0, runDistance = 0;
  for (const result of state.results) {
    const match = mid(state, result.matchId);
    if (!match || (sport && sport !== match.sport) || (region && region !== match.region) || (venue && venue !== match.venue) || (groupId && groupId !== match.groupId) || (period === 'month' && !match.date.startsWith(month)) || !result.attendedIds.includes(userId)) continue;
    if (result.sport === 'tennis' && !result.noContest) { stats.tennis.games++; if (result.teams[result.winnerTeam].includes(userId)) stats.tennis.wins++; else stats.tennis.losses++; }
    if (result.sport === 'futsal') { stats.futsal.games++; if (result.teamOutcome === 'win') stats.futsal.wins++; else if (result.teamOutcome === 'loss') stats.futsal.losses++; else stats.futsal.draws++; if (result.mvpUserId === userId) stats.futsal.mvp++; }
    if (result.sport === 'running' && result.entries[userId]) { const entry = result.entries[userId]; stats.running.runs++; stats.running.distanceKm += entry.distanceKm; runDistance += entry.distanceKm; runSeconds += entry.distanceKm * entry.paceSec; }
  }
  stats.tennis.winRate = stats.tennis.games ? Math.round(100 * stats.tennis.wins / stats.tennis.games) : 0;
  stats.running.distanceKm = Math.round(stats.running.distanceKm * 10) / 10;
  stats.running.paceSec = runDistance ? Math.round(runSeconds / runDistance) : 0;
  return stats;
}
export function ranking(state, sport, scope = {}) {
  if (!base.SPORTS.includes(sport)) return [];
  const candidates = scope.groupId ? gid(state, scope.groupId)?.memberIds || [] : state.users.map((user) => user.id);
  const rows = candidates.map((id) => ({ user: uid(state, id), stats: statsFor(state, id, { sport, ...scope }) })).filter(({ stats }) => sport === 'tennis' ? stats.tennis.games : sport === 'futsal' ? stats.futsal.games : stats.running.runs);
  rows.sort((a, b) => sport === 'tennis' ? b.stats.tennis.winRate - a.stats.tennis.winRate || b.stats.tennis.games - a.stats.tennis.games || a.user.name.localeCompare(b.user.name) : sport === 'futsal' ? b.stats.futsal.mvp - a.stats.futsal.mvp || b.stats.futsal.wins - a.stats.futsal.wins || b.stats.futsal.games - a.stats.futsal.games : a.stats.running.paceSec - b.stats.running.paceSec || b.stats.running.distanceKm - a.stats.running.distanceKm);
  return rows;
}
export function groupSummary(state, groupId, scope = {}) {
  const group = gid(state, groupId); if (!group) return null;
  const results = state.results.filter((result) => { const match = mid(state, result.matchId); return match?.groupId === groupId && (scope.period !== 'month' || match.date.startsWith(scope.month || base.today().slice(0, 7))); });
  const futsal = results.filter((result) => result.sport === 'futsal');
  const tennis = results.filter((result) => result.sport === 'tennis' && !result.noContest);
  return { games: results.length, futsalGames: futsal.length, futsalWins: futsal.filter((result) => result.teamOutcome === 'win').length, futsalWinRate: futsal.length ? Math.round(100 * futsal.filter((result) => result.teamOutcome === 'win').length / futsal.length) : 0, tennisInternalGames: tennis.length, mvp: futsal.length ? futsal.map((result) => result.mvpUserId).filter(Boolean).length : 0 };
}
export function filterMatches(state, userId, filters = {}, now = new Date()) {
  const query = clean(filters.query).toLocaleLowerCase();
  return visibleMatches(state, userId).filter((match) => {
    if (match.status === 'cancelled' && !filters.includeCancelled) return false;
    if (filters.sport && match.sport !== filters.sport) return false;
    if (filters.format && match.format !== filters.format) return false;
    if (filters.region && match.region !== filters.region) return false;
    if (filters.venue && !match.venue.toLocaleLowerCase().includes(clean(filters.venue).toLocaleLowerCase())) return false;
    if (filters.date && match.date !== filters.date) return false;
    if (filters.level && filters.level !== '무관' && match.level !== '무관' && match.level !== filters.level) return false;
    if (filters.time && (filters.time === 'morning' ? match.startTime >= '12:00' : filters.time === 'afternoon' ? match.startTime < '12:00' || match.startTime >= '18:00' : match.startTime < '18:00')) return false;
    if (filters.openOnly && !canRequestMatch(state, match, userId, now)) return false;
    if (filters.minOpenSeats && base.openSeats(match) < Number(filters.minOpenSeats)) return false;
    if (query && !`${match.title} ${match.region} ${match.venue} ${match.description}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

// Multi-sport identity: each chosen sport keeps its own metric; only session counts are combined.
const sessionCount = (stats, sport) => sport === 'tennis' ? stats.tennis.games : sport === 'futsal' ? stats.futsal.games : stats.running.runs;
export function sportIdentity(state, userId, month = base.today().slice(0, 7)) {
  const person = uid(state, userId); if (!person) return null;
  const all = statsFor(state, userId), monthly = statsFor(state, userId, { period: 'month', month });
  const sports = person.chosenSports.map((sport) => ({ sport, level: person.sports[sport].level, sessions: sessionCount(all, sport), monthSessions: sessionCount(monthly, sport) }));
  const total = sports.reduce((sum, item) => sum + item.sessions, 0);
  sports.forEach((item) => { item.share = total ? item.sessions / total : 0; });
  const partners = unique(state.results.filter((result) => result.attendedIds.includes(userId)).flatMap((result) => result.attendedIds)).filter((id) => id !== userId).length;
  return { sports, stats: all, total, partners, monthTotal: sports.reduce((sum, item) => sum + item.monthSessions, 0), activeSports: sports.filter((item) => item.sessions).length };
}
export function playedTogether(state, leftId, rightId) {
  return leftId === rightId ? 0 : state.results.filter((result) => result.attendedIds.includes(leftId) && result.attendedIds.includes(rightId)).length;
}
// Trust signals shown before applying. Ordered by strength; never more than three.
export function matchFit(state, match, viewerId) {
  const viewer = uid(state, viewerId);
  if (!viewer || !match || match.hostId === viewerId) return [];
  const chips = [];
  const together = playedTogether(state, viewerId, match.hostId);
  if (friendsOf(state, viewerId).includes(match.hostId)) chips.push({ kind: 'friend', text: together ? `친구 · 함께 ${together}회` : '친구의 자리' });
  else if (state.groups.some((item) => item.memberIds.includes(viewerId) && item.memberIds.includes(match.hostId))) chips.push({ kind: 'group', text: together ? `같은 그룹 · 함께 ${together}회` : '같은 그룹' });
  else if (together) chips.push({ kind: 'together', text: `함께 운동 ${together}회` });
  if (!viewer.chosenSports.includes(match.sport)) chips.push({ kind: 'new', text: '새 종목 도전' });
  else {
    const mine = base.LEVELS.indexOf(viewer.sports[match.sport].level), wanted = base.LEVELS.indexOf(match.level);
    if (match.level === '무관') chips.push({ kind: 'level', text: '누구나 환영' });
    else if (mine === wanted) chips.push({ kind: 'level', text: '내 수준과 같아요' });
    else if (Math.abs(mine - wanted) === 1) chips.push({ kind: 'level', text: mine < wanted ? '한 단계 위 도전' : '한 단계 여유' });
  }
  const manner = mannerFor(state, match.hostId);
  if (manner >= 4.5) chips.push({ kind: 'manner', text: `모집자 매너 ${manner.toFixed(1)}` });
  return chips.slice(0, 3);
}
// Stamp book: one stamp per completed match the user actually attended, newest first.
export function stampsFor(state, userId) {
  const stamps = state.results.filter((result) => result.attendedIds.includes(userId)).map((result) => ({ match: mid(state, result.matchId), result, partners: result.attendedIds.filter((id) => id !== userId) })).filter((stamp) => stamp.match).sort((a, b) => b.match.date.localeCompare(a.match.date) || b.match.startTime.localeCompare(a.match.startTime));
  return { stamps, venues: unique(stamps.map((stamp) => `${stamp.match.region}|${stamp.match.venue}`)).length, regions: unique(stamps.map((stamp) => stamp.match.region)).length, since: stamps.at(-1)?.match.date || null };
}
