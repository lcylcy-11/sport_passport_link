const SPORTS = { tennis: '테니스', futsal: '풋살', running: '러닝' };
const KINDS = { direct: '친구 대화', group: '그룹 대화', match: '운동 대화' };
const STATUS = { pending: '동의 대기', confirmed: '확정', rejected: '거절됨', superseded: '변경된 제안', invalid: '만료됨' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const uuid = () => globalThis.crypto.randomUUID();
const dateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const mapLink = details => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([details.region, details.venue, details.address].filter(Boolean).join(' '))}`;
const value = (form, name) => form.elements?.namedItem(name)?.value ?? '';

/** Text chat writes remain independent of the sports revision and app renders. */
export function createChatController({ request, getState, save, renderApp, openWorkout, notify, refreshState = async () => {}, onUnauthorized = async () => {} }) {
  let account = null, roomId = null, rooms = [], roomsLoaded = false, epoch = 0;
  let mounted = null, surfaceRoot = null, timer = null, fetching = null, visibilityDocument = null;
  let appointmentOpen = false, replacement = null, errorText = '', loadingEarlier = false;
  const caches = new Map(), drafts = new Map(), appointmentDrafts = new Map(), pendingMessages = new Map(), pendingOpens = new Map(), sendErrors = new Map();
  const currentState = () => getState() || {};
  const room = () => rooms.find(item => item.id === roomId);
  const userName = id => currentState().users?.find(user => user.id === id)?.name || '운동 친구';
  const key = () => `${account}:${roomId}`;
  const cache = () => {
    if (!caches.has(roomId)) caches.set(roomId, { newest: [], history: null, cursor: 0, loaded: false, hasMore: false, newestHasMore: false, unread: 0 });
    return caches.get(roomId);
  };
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function capture() {
    if (!mounted || mounted.dataset.chatRoom !== (roomId || '') || !account) return;
    const composer = mounted.querySelector('[name="text"]');
    if (composer) drafts.set(key(), composer.value);
    const form = mounted.querySelector('#chat-appointment-form');
    if (form) appointmentDrafts.set(key(), [...form.elements].filter(input => input.name && !['submit', 'button'].includes(input.type)).map(input => ({ name: input.name, value: input.value, checked: input.checked, type: input.type })));
  }
  function syncAccount() {
    const next = currentState().activeUserId || null;
    if (next === account) return;
    epoch++; stopTimer(); account = next; roomId = null; rooms = []; roomsLoaded = false;
    caches.clear(); drafts.clear(); appointmentDrafts.clear(); pendingMessages.clear(); pendingOpens.clear(); sendErrors.clear();
    appointmentOpen = false; replacement = null; errorText = ''; mounted = null;
  }
  function guard(id, actor, token) { return currentState().activeUserId === actor && account === actor && roomId === id && epoch === token; }
  async function recoverUnauthorized(error) {
    if (error.status !== 401) return false;
    dispose();
    await onUnauthorized();
    syncAccount();
    return true;
  }
  function messageHTML(message) {
    const mine = message.senderId === account;
    const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) : '';
    return `<article class="chat-message${mine ? ' is-mine' : ''}" data-message-id="${esc(message.id)}"><span class="chat-sender">${esc(mine ? '나' : userName(message.senderId))}</span><p>${esc(message.text)}</p><time datetime="${esc(message.createdAt)}">${esc(time)}</time></article>`;
  }
  function messagesHTML() {
    const data = cache(), messages = data.history || data.newest;
    return messages.length ? messages.map(messageHTML).join('') : `<p class="chat-lane-empty">${data.loaded ? '함께할 운동 이야기를 시작해 보세요.' : '메시지를 불러오는 중…'}</p>`;
  }
  function resultDetailsHTML(proposal) {
    const data = proposal.data || {}, participants = proposal.participantIds || [], attended = data.attendedIds || [];
    const sport = currentState().matches?.find(item => item.id === proposal.matchId)?.sport;
    const numericOutcome = (left, right) => Number(left) > Number(right) ? '승' : Number(left) < Number(right) ? '패' : '무';
    const scoreText = sport === 'tennis' ? data.noContest ? '경기 미성립' : `A ${data.scoreA} : B ${data.scoreB}` : sport === 'futsal' ? `우리 ${data.scoreFor} : 상대 ${data.scoreAgainst} · ${numericOutcome(data.scoreFor, data.scoreAgainst)}` : '러닝 거리 · 페이스 · 후기';
    const rows = participants.map(id => {
      const present = attended.includes(id);
      let metric = '', review = '';
      if (present && sport === 'tennis') {
        const teamA = (data.teamAIds || []).includes(id);
        metric = data.noContest ? '경기 미성립' : `${teamA ? 'A' : 'B'}팀 · ${numericOutcome(teamA ? data.scoreA : data.scoreB, teamA ? data.scoreB : data.scoreA)}`;
      } else if (present && sport === 'futsal') metric = `${data.positions?.[id] || '포지션 미입력'}${data.mvpUserId === id ? ' · MVP' : ''}`;
      else if (present && sport === 'running') {
        const entry = data.entries?.[id];
        if (entry) {
          const seconds = Number(entry.paceSec);
          metric = `${entry.distanceKm}km · ${Math.floor(seconds / 60)}′${String(seconds % 60).padStart(2, '0')}″/km`;
        }
        review = data.reviews?.[id] || '';
      }
      return `<p data-result-participant="${esc(id)}"><strong>${esc(userName(id))} · ${present ? '참석' : '불참으로 제안'}</strong>${metric ? `<br>${esc(metric)}` : ''}${review ? `<br><span>${esc(review)}</span>` : ''}</p>`;
    }).join('');
    return `<p><strong>${esc(SPORTS[sport] || '운동')} · ${esc(scoreText)}</strong></p><div class="chat-result-breakdown">${rows}</div><p class="hint">참석 여부와 결과를 모두 확인한 뒤 동의해 주세요.</p>`;
  }
  function proposalHTML(proposal, result = false) {
    const details = proposal.details || {}, approved = proposal.approvedIds || [], participants = proposal.participantIds || [];
    const canDecide = proposal.status === 'pending' && participants.includes(account) && !approved.includes(account);
    const matchId = proposal.matchId || details.existingMatchId;
    return `<article class="chat-proposal" data-proposal-id="${esc(proposal.id)}"><div class="chat-proposal-top"><span>${result ? '운동 기록' : SPORTS[details.sport] || '운동 약속'} · v${esc(proposal.version)}</span><b class="pill ${proposal.status === 'confirmed' ? 'done' : 'mute'}">${esc(STATUS[proposal.status] || proposal.status)}</b></div>
      <h3>${esc(result ? '운동 기록 확인' : details.title || '함께하는 운동')}</h3>
      ${result ? resultDetailsHTML(proposal) : `<p>${esc(details.date)} · ${esc(details.startTime)}–${esc(details.endTime)} <small>한국 시간</small></p><p>${esc(details.region)} · ${esc(details.venue)}</p>${details.address ? `<p class="chat-address">${esc(details.address)}</p>` : ''}`}
      <p class="chat-approval">${approved.length}/${participants.length}명 승인 · 참가자 전원 동의</p><p class="chat-participants">${participants.map(userName).map(esc).join(' · ')}</p>
      <div class="chat-proposal-actions">${!result && details.venue ? `<a class="text-btn" href="${esc(mapLink(details))}" target="_blank" rel="noopener noreferrer">지도 열기 ↗</a>` : ''}
      ${matchId ? `<button type="button" class="text-btn" data-action="chat-workout" data-match="${esc(matchId)}">${proposal.status === 'confirmed' ? '운동 상세 · 평가' : '운동 상세'}</button>` : ''}
      ${canDecide ? `<button type="button" class="btn primary small" data-action="chat-${result ? 'result' : 'appointment'}-accept" data-id="${esc(proposal.id)}" data-version="${esc(proposal.version)}">동의</button><button type="button" class="btn ghost small" data-action="chat-${result ? 'result' : 'appointment'}-reject" data-id="${esc(proposal.id)}" data-version="${esc(proposal.version)}">거절</button>` : ''}
      ${!result && proposal.status === 'pending' && participants.includes(account) ? `<button type="button" class="text-btn" data-action="chat-change" data-id="${esc(proposal.id)}" data-version="${esc(proposal.version)}">변경 제안</button>` : ''}
      ${proposal.status === 'pending' && approved.includes(account) ? '<span class="chat-approved">내 동의 완료</span>' : ''}</div></article>`;
  }
  function proposalsHTML() {
    if (!room()) return '';
    const state = currentState();
    const appointments = (state.appointmentProposals || []).filter(item => item.roomId === roomId && item.status !== 'superseded');
    const ids = new Set([room()?.matchId, ...appointments.map(item => item.matchId)].filter(Boolean));
    const results = (state.resultProposals || []).filter(item => ids.has(item.matchId) && item.status !== 'superseded');
    return [...appointments.map(item => proposalHTML(item)), ...results.map(item => proposalHTML(item, true))].join('');
  }
  function appointmentHTML() {
    const activeRoom = room(); if (!appointmentOpen || !activeRoom) return '';
    const existing = currentState().matches?.find(item => item.id === activeRoom.matchId);
    const source = replacement?.details || existing || {};
    const stored = appointmentDrafts.get(key());
    const fieldValue = name => stored?.find(item => item.name === name)?.value ?? source[name] ?? ({ sport: 'tennis', date: dateToday(), region: currentState().users?.find(item => item.id === account)?.region || '' }[name] || '');
    const participants = activeRoom.participantIds || [];
    const picked = stored ? stored.filter(item => item.name === 'participantIds' && item.checked).map(item => item.value) : replacement?.participantIds || participants;
    const groupChoice = activeRoom.kind === 'group';
    const input = (name, label, type = 'text', required = true, max = 100) => `<label>${label}<input name="${name}" type="${type}" value="${esc(fieldValue(name))}"${required ? ' required' : ''}${type === 'text' ? ` maxlength="${max}"` : ''}></label>`;
    return `<form id="chat-appointment-form" class="chat-appointment-form"><div class="chat-section-title"><h3>${replacement ? '약속 변경 제안' : activeRoom.kind === 'match' ? '운동 일정 변경' : '약속 잡기'}</h3><button class="text-btn" type="button" data-action="chat-appointment-close">닫기</button></div><p class="hint">${replacement ? '새 버전에서는 이전 동의가 초기화돼요. ' : ''}참가자 전원 동의 후 내 운동에 반영돼요.</p>
      <label>종목<select name="sport" required>${Object.entries(SPORTS).map(([sport, label]) => `<option value="${sport}"${fieldValue('sport') === sport ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      ${input('title', '약속 이름', 'text', true, 60)}${input('date', '날짜', 'date')}<div class="chat-time-fields">${input('startTime', '시작 · 한국 시간', 'time')}${input('endTime', '종료 · 한국 시간', 'time')}</div>${input('region', '지역', 'text', true, 30)}${input('venue', '장소', 'text', true, 60)}${input('address', '주소 · 선택', 'text', false, 200)}
      <fieldset><legend>${groupChoice ? '함께할 그룹 회원' : '확정 참가자'}</legend>${participants.map(id => `<label class="chat-member"><input type="checkbox" name="participantIds" value="${esc(id)}"${id === account || picked.includes(id) ? ' checked' : ''}${!groupChoice || id === account ? ' disabled' : ''}><span>${esc(userName(id))}${id === account ? ' (나)' : ''}</span></label>`).join('')}</fieldset><p class="hint">테니스 2명 또는 4명 · 풋살 2–12명 · 러닝 2–20명</p>
      <label>메모 · 선택<textarea name="description" maxlength="500" rows="2">${esc(fieldValue('description'))}</textarea></label><button class="btn primary" type="submit">${replacement ? '변경안 보내기' : '약속 제안 보내기'}</button></form>`;
  }
  function render() {
    syncAccount(); capture();
    if (!account) return '';
    if (!roomId) return `<section class="chat-view" data-chat-view data-chat-room=""><div class="head"><h2>채팅</h2><p class="hint">친구, 함께하는 운동, 그룹에서 대화를 열어 보세요.</p></div><div class="chat-room-list">${rooms.length ? rooms.map(item => `<button type="button" class="chat-room" data-action="chat-room" data-room="${esc(item.id)}"><span class="chat-room-avatar" aria-hidden="true">${item.kind === 'group' ? '✳' : item.kind === 'match' ? '↗' : '☺'}</span><span class="chat-room-main"><span class="chat-room-kind">${esc(KINDS[item.kind])}</span><strong>${esc(item.title)}</strong><small>${esc(item.lastMessage?.text || '대화를 시작해 보세요.')}</small></span><span aria-hidden="true">›</span></button>`).join('') : `<div class="empty"><p>${roomsLoaded ? '아직 열린 대화가 없어요.' : '대화를 불러오는 중…'}</p></div>`}</div>${errorText ? `<p role="status" class="chat-error">${esc(errorText)}</p>` : ''}</section>`;
    const activeRoom = room(), data = cache();
    return `<section class="chat-view chat-room-view" data-chat-view data-chat-room="${esc(roomId)}"><header class="chat-room-heading"><button type="button" class="icon-btn" data-action="chat-back" aria-label="대화 목록으로">‹</button><div><small data-chat-kind>${esc(KINDS[activeRoom?.kind] || '대화')}</small><h2 data-chat-title>${esc(activeRoom?.title || '대화 불러오는 중…')}</h2></div><button type="button" class="btn soft small" data-action="chat-appointment"${activeRoom ? '' : ' disabled'}>약속 잡기</button></header><p class="hint chat-group-hint" data-chat-group-hint${activeRoom?.kind === 'group' ? '' : ' hidden'}>현재 그룹 회원이 볼 수 있는 대화예요.</p>
      <div data-chat-proposals class="chat-proposals">${proposalsHTML()}</div>${appointmentHTML()}
      <div class="chat-history-controls"><button type="button" class="text-btn" data-action="chat-earlier"${data.hasMore ? '' : ' hidden'}>이전 메시지 보기</button><button type="button" class="text-btn" data-action="chat-latest"${data.history ? '' : ' hidden'}>최근 대화${data.unread ? ` · 새 메시지 ${data.unread}` : ''}</button></div>
       <div class="chat-messages" data-chat-messages role="log" aria-label="대화 메시지" aria-live="polite" aria-relevant="additions text" tabindex="0">${messagesHTML()}</div><p class="chat-error" data-chat-error role="status">${esc(sendErrors.get(key()) || errorText)}</p>
      <form id="chat-message-form" class="chat-composer"><label class="sr-only" for="chat-message-text">메시지</label><textarea id="chat-message-text" name="text" maxlength="1000" rows="2" required placeholder="메시지를 입력하세요">${esc(drafts.get(key()) || '')}</textarea><button type="submit" class="btn primary" aria-label="메시지 보내기">보내기</button></form></section>`;
  }
  function paint({ earlier = false, forceBottom = false } = {}) {
    if (!mounted || mounted.dataset.chatRoom !== roomId) return;
    const activeRoom = room(), title = mounted.querySelector('[data-chat-title]'), kind = mounted.querySelector('[data-chat-kind]');
    if (title) title.textContent = activeRoom?.title || '대화';
    if (kind) kind.textContent = KINDS[activeRoom?.kind] || '대화';
    const appointment = mounted.querySelector('[data-action="chat-appointment"]'); if (appointment) appointment.disabled = !activeRoom;
    const groupHint = mounted.querySelector('[data-chat-group-hint]'); if (groupHint) groupHint.hidden = activeRoom?.kind !== 'group';
    const lane = mounted.querySelector('[data-chat-messages]');
    if (lane) {
      const top = lane.scrollTop, height = lane.scrollHeight, bottom = height - top - lane.clientHeight < 64;
      const html = messagesHTML();
      if (lane.innerHTML !== html) lane.innerHTML = html;
      lane.scrollTop = forceBottom || (!earlier && bottom && !cache().history) ? lane.scrollHeight : earlier ? Math.max(0, top + lane.scrollHeight - height) : top;
    }
    const proposals = mounted.querySelector('[data-chat-proposals]');
    if (proposals) { const html = proposalsHTML(); if (proposals.innerHTML !== html) proposals.innerHTML = html; }
    const error = mounted.querySelector('[data-chat-error]'); if (error) error.textContent = sendErrors.get(key()) || errorText;
    const before = mounted.querySelector('[data-action="chat-earlier"]'); if (before) before.hidden = !cache().hasMore;
    const latest = mounted.querySelector('[data-action="chat-latest"]');
    if (latest) { latest.hidden = !cache().history; latest.textContent = `최근 대화${cache().unread ? ` · 새 메시지 ${cache().unread}` : ''}`; }
  }
  function mergeMessages(messages, { initial = false, advanceCursor = true } = {}) {
    const data = cache(), oldIds = new Set(data.newest.map(item => item.id));
    const valid = messages.filter(item => Number.isInteger(item.id) && (!item.roomId || item.roomId === roomId));
    const merged = new Map(data.newest.map(item => [item.id, item])); valid.forEach(item => merged.set(item.id, item));
    data.newest = [...merged.values()].sort((a, b) => a.id - b.id).slice(-100);
    if (merged.size > 100) { data.newestHasMore = true; if (!data.history) data.hasMore = true; }
    // Sent messages can overtake unseen peer messages. Only ordered read pages
    // advance the server-read cursor; insertion/dedup is shared with send replies.
    if (advanceCursor && valid.length) data.cursor = Math.max(data.cursor, ...valid.map(item => item.id));
    if (!initial && data.history) data.unread += valid.filter(item => !oldIds.has(item.id)).length;
  }
  async function poll() {
    syncAccount();
    if (!account || !mounted || surfaceRoot?.hidden || visibilityDocument?.hidden) return;
    if (fetching) return fetching;
    const actor = account, id = roomId, token = epoch;
    const operation = async () => {
      try {
        const response = await request('/api/chats'); if (!guard(id, actor, token) || visibilityDocument?.hidden || surfaceRoot?.hidden) return;
        const listChanged = !roomsLoaded || JSON.stringify(rooms) !== JSON.stringify(response.rooms || []);
        rooms = response.rooms || []; roomsLoaded = true;
        if (id) {
          if (!room()) {
            caches.delete(id); drafts.delete(key()); appointmentDrafts.delete(key()); sendErrors.delete(key()); pendingMessages.delete(key());
            const composer = mounted?.querySelector('[name="text"]'); if (composer) composer.value = '';
            errorText = '이 대화를 열 수 없어요. 대화 목록을 확인해 주세요.'; paint(); return;
          }
          const data = cache(), initial = !data.loaded;
          const result = await request(`/api/chats/${encodeURIComponent(id)}/messages?limit=100${initial ? '' : `&after=${data.cursor}`}`);
          if (!guard(id, actor, token) || visibilityDocument?.hidden || surfaceRoot?.hidden) return;
          mergeMessages(result.messages || [], { initial }); data.loaded = true;
          if (initial) data.hasMore = data.newestHasMore = result.hasMore ?? (result.messages?.length === 100);
          await refreshState(); if (!guard(id, actor, token)) return;
          errorText = ''; paint();
        } else if (listChanged) renderApp();
      } catch (error) {
        if (!guard(id, actor, token)) return;
        if (await recoverUnauthorized(error)) return;
        if ([401, 403].includes(error.status) && id) { caches.delete(id); rooms = rooms.filter(item => item.id !== id); }
        errorText = error.message || '대화를 불러오지 못했어요.'; if (id) paint();
      }
    };
    fetching = operation(); const running = fetching;
    try { await running; } finally { if (fetching === running) fetching = null; }
  }
  function onInput() { capture(); }
  function onVisibility() { if (visibilityDocument?.hidden) stopTimer(); else if (mounted) { startTimer(); void poll(); } }
  function startTimer() { stopTimer(); if (account && mounted && !surfaceRoot?.hidden && !visibilityDocument?.hidden) { timer = setInterval(() => { void poll(); }, 4000); timer.unref?.(); } }
  async function mount(root = globalThis.document) {
    syncAccount();
    const next = root?.querySelector('[data-chat-view]');
    if (!next) { dispose(); return; }
    if (mounted !== next) {
      if (mounted) { capture(); mounted.removeEventListener('input', onInput); mounted.removeEventListener('change', onInput); }
      mounted = next; next.addEventListener('input', onInput); next.addEventListener('change', onInput);
    }
    surfaceRoot = root;
    const doc = root.ownerDocument || globalThis.document || root;
    if (visibilityDocument !== doc) { visibilityDocument?.removeEventListener('visibilitychange', onVisibility); visibilityDocument = doc; doc.addEventListener?.('visibilitychange', onVisibility); }
    startTimer(); await poll();
  }
  function dispose() {
    capture(); epoch++; stopTimer();
    mounted?.removeEventListener('input', onInput); mounted?.removeEventListener('change', onInput);
    visibilityDocument?.removeEventListener('visibilitychange', onVisibility); visibilityDocument = null; mounted = null; surfaceRoot = null;
  }
  function setRoom(id) {
    syncAccount(); if (roomId === (id || null)) return;
    capture(); epoch++; stopTimer(); roomId = id || null; appointmentOpen = false; replacement = null; errorText = ''; mounted = null;
  }
  function routeTo(id) {
    setRoom(id); if (globalThis.window) window.location.hash = `#/community?tab=chats${id ? `&room=${encodeURIComponent(id)}` : ''}`;
    renderApp();
  }
  async function open(context) {
    syncAccount(); if (!account) return false;
    const actor = account, token = epoch, contextKey = JSON.stringify(context);
    let payload = pendingOpens.get(contextKey);
    if (!payload) { payload = { ...context, expectedUserId: actor, requestId: uuid() }; pendingOpens.set(contextKey, payload); }
    try {
      const response = await request('/api/chats/open', payload);
      if (currentState().activeUserId !== actor || epoch !== token) return false;
      pendingOpens.delete(contextKey); rooms = [...rooms.filter(item => item.id !== response.room.id), response.room]; routeTo(response.room.id); return true;
    } catch (error) { if (currentState().activeUserId === actor && epoch === token && !await recoverUnauthorized(error)) notify(error.message, true); return false; }
  }
  async function earlier() {
    if (loadingEarlier || !roomId || !cache().hasMore) return;
    const actor = account, id = roomId, token = epoch, data = cache(), oldest = (data.history || data.newest)[0]?.id;
    if (!oldest) return; loadingEarlier = true;
    try {
      const result = await request(`/api/chats/${encodeURIComponent(id)}/messages?limit=100&before=${oldest}`);
      if (!guard(id, actor, token)) return;
      const messages = result.messages || [];
      if (messages.length) data.history = messages.slice(-100);
      data.hasMore = result.hasMore ?? messages.length === 100; paint({ earlier: true });
    } catch (error) { if (guard(id, actor, token) && !await recoverUnauthorized(error)) notify(error.message, true); }
    finally { loadingEarlier = false; }
  }
  async function handleAction(action, button) {
    if (!action?.startsWith('chat-')) return false;
    syncAccount(); if (!account) return true;
    const data = button?.dataset || {};
    if (action === 'chat-room') routeTo(data.room);
    else if (action === 'chat-back') routeTo(null);
    else if (action === 'chat-earlier') await earlier();
    else if (action === 'chat-latest') { cache().history = null; cache().unread = 0; cache().hasMore = cache().newestHasMore; paint({ forceBottom: true }); }
    else if (action === 'chat-workout') openWorkout(data.match);
    else if (action === 'chat-appointment') { capture(); appointmentOpen = true; replacement = null; renderApp(); }
    else if (action === 'chat-appointment-close') { capture(); appointmentOpen = false; replacement = null; renderApp(); }
    else if (action === 'chat-change') {
      const proposal = currentState().appointmentProposals?.find(item => item.id === data.id && item.version === Number(data.version) && item.status === 'pending');
      if (!proposal) { notify('제안이 변경됐어요. 최신 내용을 확인해 주세요.', true); await poll(); return true; }
      capture(); appointmentDrafts.delete(key()); replacement = proposal; appointmentOpen = true; renderApp();
    } else if (/^chat-(appointment|result)-(accept|reject)$/.test(action)) {
      const result = action.startsWith('chat-result'), proposal = (currentState()[result ? 'resultProposals' : 'appointmentProposals'] || []).find(item => item.id === data.id);
      if (!proposal || proposal.version !== Number(data.version) || proposal.status !== 'pending') { notify('제안이 변경됐어요. 최신 내용을 확인하고 다시 동의해 주세요.', true); await poll(); return true; }
      try { await save(`${result ? 'result' : 'appointment'}.decide`, { proposalId: data.id, version: Number(data.version), decision: action.endsWith('accept') ? 'accepted' : 'rejected' }, action.endsWith('accept') ? '동의를 보냈어요.' : '제안을 거절했어요.'); }
      catch (error) { notify(error.message, true); await poll(); }
    }
    return true;
  }
  async function submitMessage(form) {
    const text = value(form, 'text').trim();
    if (!text || text.length > 1000) { notify('메시지는 1–1000자로 입력해 주세요.', true); return; }
    const actor = account, id = roomId, token = epoch, draftKey = key();
    let outgoing = pendingMessages.get(draftKey);
    if (outgoing?.busy) return;
    if (!outgoing || outgoing.text !== text) { outgoing = { text, clientMessageId: uuid(), expectedUserId: actor, busy: false }; pendingMessages.set(draftKey, outgoing); }
    outgoing.busy = true; drafts.set(draftKey, value(form, 'text'));
    const submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
    try {
      const response = await request(`/api/chats/${encodeURIComponent(id)}/messages`, { text: outgoing.text, clientMessageId: outgoing.clientMessageId, expectedUserId: outgoing.expectedUserId });
      if (!guard(id, actor, token)) return;
      pendingMessages.delete(draftKey); sendErrors.delete(draftKey); mergeMessages([response.message], { advanceCursor: false });
      const composer = form.elements?.namedItem('text');
      if (composer?.value.trim() === text) { composer.value = ''; drafts.set(draftKey, ''); }
      errorText = ''; paint({ forceBottom: !cache().history });
    } catch (error) { if (guard(id, actor, token) && !await recoverUnauthorized(error)) { sendErrors.set(draftKey,'전송하지 못했어요. 보내기를 누르면 같은 메시지를 다시 시도해요.'); paint(); notify(error.message, true); } }
    finally { outgoing.busy = false; if (submit?.isConnected !== false) submit && (submit.disabled = false); }
  }
  async function submitAppointment(form) {
    if (!room()) return;
    capture(); const activeRoom = room(), actor = account, id = roomId, token = epoch;
    const participantIds = activeRoom.kind === 'group' ? [...new Set([actor, ...[...form.querySelectorAll('[name="participantIds"]:checked')].map(input => input.value)])] : [...activeRoom.participantIds];
    const payload = Object.fromEntries(['sport', 'title', 'region', 'venue', 'address', 'date', 'startTime', 'endTime', 'description'].map(name => [name, value(form, name).trim()]));
    const count = participantIds.length;
    if (!SPORTS[payload.sport] || (payload.sport === 'tennis' ? ![2, 4].includes(count) : count < 2 || count > (payload.sport === 'futsal' ? 12 : 20))) { notify('종목에 맞는 참가자 수를 선택해 주세요. 테니스 2명/4명, 풋살 2–12명, 러닝 2–20명', true); return; }
    if (!payload.title || !payload.region || !payload.venue || !payload.date || !payload.startTime || !payload.endTime || payload.startTime >= payload.endTime) { notify('약속 이름, 장소와 시작·종료 시간을 확인해 주세요.', true); return; }
    Object.assign(payload, { roomId: id, participantIds });
    if (activeRoom.matchId) payload.existingMatchId = activeRoom.matchId;
    if (replacement) payload.replacesId = replacement.id;
    try {
      const saved = await save('appointment.propose', payload, '약속 제안을 보냈어요.');
      if (saved && guard(id, actor, token)) { appointmentOpen = false; replacement = null; appointmentDrafts.delete(key()); renderApp(); }
    } catch (error) { if (guard(id, actor, token)) notify(error.message, true); }
  }
  async function handleSubmit(form) {
    if (!['chat-message-form', 'chat-appointment-form'].includes(form?.id)) return false;
    syncAccount(); if (!account || !roomId) return true;
    if (form.id === 'chat-message-form') await submitMessage(form); else await submitAppointment(form);
    return true;
  }
  return { render, mount, dispose, setRoom, open, handleAction, handleSubmit };
}
