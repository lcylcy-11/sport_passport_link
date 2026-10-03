import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatController } from './chat-view.js';

const room = { id: 'room-one', kind: 'group', title: '같이 운동', groupId: 'group-one', participantIds: ['a', 'b', 'c'] };
const fixture = () => ({ activeUserId: 'a', users: [{ id: 'a', name: '나', region: '서울' }, { id: 'b', name: '친구' }, { id: 'c', name: '셋째' }], groups: [{ id: 'group-one', memberIds: ['a', 'b', 'c'] }], matches: [], appointmentProposals: [], resultProposals: [] });
const button = data => ({ dataset: data });
test('401 from poll, open or send recovers authentication; room-only 403 does not', async () => {
  for (const source of ['poll', 'open', 'send', 'forbidden']) {
    let current = fixture(), denied = false, recovered = 0;
    const chat = controller({ getState: () => current, onUnauthorized: async () => { recovered++; current = null; }, request: async (path, payload) => {
      if (denied) throw Object.assign(new Error('denied'), { status: source === 'forbidden' ? 403 : 401 });
      return path === '/api/chats' ? {rooms:[room]} : payload ? {room} : {messages:[]};
    } });
    chat.setRoom(room.id); const dom = surface(); await chat.mount(dom.root);
    denied = true;
    if (source === 'open') await chat.open({kind:'group',groupId:room.groupId});
    else if (source === 'send') await chat.handleSubmit({id:'chat-message-form',elements:{namedItem:()=>({value:'test'})},querySelector:()=>null});
    else await chat.mount(dom.root);
    assert.equal(recovered, source === 'forbidden' ? 0 : 1);
    if (source !== 'forbidden') assert.equal(chat.render(), '');
    chat.dispose();
  }
});
test('a late 401 from an old account cannot sign out the current account', async () => {
  let current = fixture(), reject, recovered = 0;
  const chat = controller({getState:()=>current,onUnauthorized:async()=>{recovered++;},request:()=>new Promise((resolve, fail)=>{reject=fail;})});
  const pending = chat.open({kind:'group',groupId:room.groupId});
  current = {...current,activeUserId:'b'}; chat.render();
  reject(Object.assign(new Error('expired'),{status:401})); await pending;
  assert.equal(recovered,0); chat.dispose();
});
function surface() {
  const lane = { innerHTML: '', scrollTop: 18, scrollHeight: 1000, clientHeight: 300 };
  const composer = { value: '작성하던 메시지', selectionStart: 4, selectionEnd: 4 };
  const proposals = { innerHTML: '' };
  const node = { dataset: { chatRoom: room.id }, querySelector(selector) { return selector === '[data-chat-messages]' ? lane : selector === '[data-chat-proposals]' ? proposals : selector === '[name="text"]' ? composer : null; }, querySelectorAll() { return []; }, addEventListener() {}, removeEventListener() {} };
  const root = { hidden: false, querySelector(selector) { return selector === '[data-chat-view]' ? node : null; }, addEventListener() {}, removeEventListener() {} };
  return { lane, composer, node, root };
}
function controller(overrides = {}) {
  return createChatController({ request: async path => path === '/api/chats' ? { rooms: [room] } : { messages: [], cursor: 0 }, getState: fixture, save: async () => true, renderApp() {}, openWorkout() {}, notify() {}, ...overrides });
}

test('renders literal long message text safely without active HTML', async () => {
  const text = '<script>alert("x")</script>\n' + '가'.repeat(970);
  const chat = controller({ request: async path => path === '/api/chats' ? { rooms: [room] } : { messages: [{ id: 1, roomId: room.id, senderId: 'b', text, createdAt: '2026-10-03T10:00:00Z' }], cursor: 1 } });
  chat.setRoom(room.id);
  const dom = surface(); await chat.mount(dom.root);
  assert.match(dom.lane.innerHTML, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.ok(dom.lane.innerHTML.includes('가'.repeat(970)));
  assert.doesNotMatch(dom.lane.innerHTML, /<script>/);
  assert.match(chat.render(), /maxlength="1000"/);
  chat.dispose();
});

test('group appointment selects members and explains unanimous approval', async () => {
  const chat = controller(); chat.setRoom(room.id); await chat.mount(surface().root);
  await chat.handleAction('chat-appointment', button({}));
  const html = chat.render();
  assert.match(html, /name="participantIds" value="b"/);
  assert.match(html, /name="participantIds" value="c"/);
  assert.match(html, /전원 동의/);
  assert.match(html, /chat-appointment-form/);
  assert.match(html, /name="title"[^>]*maxlength="60"/);
  assert.match(html, /name="region"[^>]*maxlength="30"/);
  assert.match(html, /name="venue"[^>]*maxlength="60"/);
  assert.match(html, /name="description" maxlength="500"/);
  chat.dispose();
});

test('new message updates only lane while preserving draft and history scroll', async () => {
  let reads = 0;
  const chat = controller({ request: async path => path === '/api/chats' ? { rooms: [room] } : { messages: [{ id: ++reads, roomId: room.id, senderId: 'b', text: `메시지${reads}`, createdAt: '2026-10-03T10:00:00Z' }], cursor: reads } });
  const dom = surface(); chat.setRoom(room.id); await chat.mount(dom.root);
  dom.lane.scrollTop = 18;
  await chat.mount(dom.root);
  assert.equal(dom.composer.value, '작성하던 메시지');
  assert.equal(dom.composer.selectionStart, 4);
  assert.equal(dom.lane.scrollTop, 18);
  assert.match(dom.lane.innerHTML, /메시지2/);
  chat.dispose();
});

test('same failed message retries with the original clientMessageId', async () => {
  const writes = [];
  const chat = controller({ request: async (path, payload) => {
    if (path === '/api/chats') return { rooms: [room] };
    if (payload) { writes.push(payload); if (writes.length === 1) throw new Error('offline'); return { message: { id: 2, senderId: 'a', text: payload.text, roomId: room.id } }; }
    return { messages: [], cursor: 0 };
  } });
  chat.setRoom(room.id); await chat.mount(surface().root);
  const form = { id: 'chat-message-form', elements: { namedItem: () => ({ value: '메시지' }) }, querySelector: () => null };
  await chat.handleSubmit(form); await chat.handleSubmit(form);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].clientMessageId, writes[1].clientMessageId);
  assert.equal(writes[0].expectedUserId, 'a');
  chat.dispose();
});

test('successful receive polls cannot erase an unsent-message warning', async () => {
  let fail=true;
  const chat=controller({request:async(path,payload)=>{
    if(path==='/api/chats')return {rooms:[room]};
    if(payload){if(fail)throw new Error('offline');return {message:{id:4,senderId:'a',text:payload.text,roomId:room.id}};}
    return {messages:[],cursor:0};
  }});
  chat.setRoom(room.id); const dom=surface(); await chat.mount(dom.root);
  const form={id:'chat-message-form',elements:{namedItem:()=>({value:'보존할 메시지'})},querySelector:()=>null};
  await chat.handleSubmit(form);
  assert.match(chat.render(),/전송하지 못했어요/);
  await chat.mount(dom.root);
  assert.match(chat.render(),/전송하지 못했어요/);
  fail=false;await chat.handleSubmit(form);
  assert.doesNotMatch(chat.render(),/전송하지 못했어요/);
  chat.dispose();
});

test('late old-account replies cannot enter the new account view', async () => {
  let state = fixture(), release;
  const chat = controller({ getState: () => state, request: async path => path === '/api/chats' ? { rooms: [room] } : new Promise(resolve => { release = resolve; }) });
  const dom = surface(); chat.setRoom(room.id); const waiting = chat.mount(dom.root);
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  state = { ...fixture(), activeUserId: 'b' };
  chat.render(); release({ messages: [{ id: 1, senderId: 'a', text: 'private-old-account' }], cursor: 1 }); await waiting;
  assert.doesNotMatch(chat.render(), /private-old-account|같이 운동/);
  chat.dispose();
});

test('old proposal buttons cannot approve a different version', async () => {
  const writes = [], state = fixture();
  state.appointmentProposals = [{ id: 'proposal', roomId: room.id, version: 2, status: 'pending', participantIds: ['a', 'b'], approvedIds: ['b'], details: { sport: 'tennis', venue: '코트', region: '서울' } }];
  const chat = controller({ getState: () => state, save: async (...args) => { writes.push(args); return true; } });
  chat.setRoom(room.id); await chat.mount(surface().root);
  await chat.handleAction('chat-appointment-accept', button({ id: 'proposal', version: '1' }));
  assert.equal(writes.length, 0);
  await chat.handleAction('chat-appointment-accept', button({ id: 'proposal', version: '2' }));
  assert.deepEqual(writes[0].slice(0, 2), ['appointment.decide', { proposalId: 'proposal', version: 2, decision: 'accepted' }]);
  chat.dispose();
});

test('rejects three-player tennis group appointment before save', async () => {
  const writes = [], notices = [];
  const chat = controller({ save: async (...args) => { writes.push(args); return true; }, notify: (...args) => notices.push(args) });
  chat.setRoom(room.id); await chat.mount(surface().root);
  const fields = { sport: 'tennis', title: '운동', region: '서울', venue: '코트', address: '', date: '2026-10-10', startTime: '18:00', endTime: '19:00', description: '' };
  const form = { id: 'chat-appointment-form', elements: { namedItem: name => ({ value: fields[name] }) }, querySelectorAll: () => [{ value: 'b' }, { value: 'c' }] };
  await chat.handleSubmit(form);
  assert.equal(writes.length, 0);
  assert.match(notices[0][0], /참가자 수/);
  fields.sport = 'running'; await chat.handleSubmit(form);
  assert.equal(writes[0][0], 'appointment.propose');
  assert.deepEqual(writes[0][1].participantIds, ['a', 'b', 'c']);
  chat.dispose();
});

test('load-earlier keeps history separate from newly polled text and returns to newest', async () => {
  let reads = 0;
  const chat = controller({ request: async path => {
    if (path === '/api/chats') return { rooms: [room] };
    if (path.includes('before=')) return { messages: [{ id: 10, senderId: 'b', text: '이전 기록' }], cursor: 10, hasMore: false };
    return { messages: [{ id: 100 + reads++, senderId: 'b', text: `최근 기록${reads}` }], cursor: 100, hasMore: true };
  } });
  const dom = surface(); chat.setRoom(room.id); await chat.mount(dom.root);
  await chat.handleAction('chat-earlier', button({}));
  assert.match(dom.lane.innerHTML, /이전 기록/);
  await chat.mount(dom.root);
  assert.doesNotMatch(dom.lane.innerHTML, /최근 기록/);
  await chat.handleAction('chat-latest', button({}));
  assert.match(dom.lane.innerHTML, /최근 기록2/);
  assert.doesNotMatch(chat.render(), /data-action="chat-earlier" hidden/);
  chat.dispose();
});

test('disposed controller ignores a late request and stops changing its lane', async () => {
  let release;
  const chat = controller({ request: async path => path === '/api/chats' ? { rooms: [room] } : new Promise(resolve => { release = resolve; }) });
  const dom = surface(); chat.setRoom(room.id); const waiting = chat.mount(dom.root);
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  chat.dispose(); release({ messages: [{ id: 1, senderId: 'b', text: 'late-text' }], cursor: 1 }); await waiting;
  assert.doesNotMatch(dom.lane.innerHTML, /late-text/);
});

test('message bounds prevent empty and overlong writes', async () => {
  const writes = [];
  const chat = controller({ request: async (path, payload) => { if (payload) writes.push(payload); return path === '/api/chats' ? { rooms: [room] } : { messages: [], cursor: 0 }; } });
  chat.setRoom(room.id); await chat.mount(surface().root);
  const input = { value: '   ' }, form = { id: 'chat-message-form', elements: { namedItem: () => input }, querySelector: () => null };
  await chat.handleSubmit(form); input.value = '가'.repeat(1001); await chat.handleSubmit(form);
  assert.equal(writes.length, 0); chat.dispose();
});

test('refreshState updates proposal area while leaving appointment editing intact', async () => {
  const state = fixture(), dom = surface();
  const chat = controller({ getState: () => state, refreshState: async () => { state.appointmentProposals = [{ id: 'new', roomId: room.id, version: 1, status: 'pending', approvedIds: ['b'], participantIds: ['a', 'b'], details: { title: '새 약속', sport: 'tennis', region: '서울', venue: '연습 코트', address: '<주소>' } }]; } });
  chat.setRoom(room.id); await chat.mount(dom.root);
  assert.match(dom.node.querySelector('[data-chat-proposals]').innerHTML, /새 약속/);
  assert.match(dom.node.querySelector('[data-chat-proposals]').innerHTML, /&lt;주소&gt;/);
  assert.match(dom.node.querySelector('[data-chat-proposals]').innerHTML, /https:\/\/www.google.com\/maps\/search\/\?api=1&amp;query=/);
  assert.equal(dom.composer.value, '작성하던 메시지'); chat.dispose();
});

test('result approval cards disclose tennis scores, teams and absent scheduled reviewers', async () => {
  const state = fixture();
  state.matches = [{ id: 'match', sport: 'tennis' }];
  state.resultProposals = [{ id: 'result', matchId: 'match', version: 1, status: 'pending', approvedIds: ['b'], participantIds: ['a', 'b', 'c'], data: { attendedIds: ['a', 'b'], teamAIds: ['b'], scoreA: '6', scoreB: '4', noContest: false } }];
  const activeRoom = { ...room, kind: 'match', matchId: 'match' };
  const chat = controller({ getState: () => state, request: async path => path === '/api/chats' ? { rooms: [activeRoom] } : { messages: [], cursor: 0 } });
  chat.setRoom(room.id); await chat.mount(surface().root);
  const html = chat.render();
  assert.match(html, /A 6 : B 4/);
  assert.match(html, /친구 · 참석[\s\S]*A팀 · 승/);
  assert.match(html, /나 · 참석[\s\S]*B팀 · 패/);
  assert.match(html, /셋째 · 불참으로 제안/);
  chat.dispose();
});

test('result approval cards disclose futsal score MVP positions and literal running reviews', async () => {
  const state = fixture(), activeRoom = { ...room, kind: 'match', matchId: 'match' };
  state.matches = [{ id: 'match', sport: 'futsal' }];
  state.resultProposals = [{ id: 'result', matchId: 'match', version: 1, status: 'pending', approvedIds: ['b'], participantIds: ['a', 'b', 'c'], data: { attendedIds: ['a', 'b'], scoreFor: '3', scoreAgainst: '1', mvpUserId: 'b', positions: { a: '골키퍼', b: '<공격>' } } }];
  const chat = controller({ getState: () => state, request: async path => path === '/api/chats' ? { rooms: [activeRoom] } : { messages: [], cursor: 0 } });
  chat.setRoom(room.id); await chat.mount(surface().root);
  let html = chat.render();
  assert.match(html, /우리 3 : 상대 1 · 승/);
  assert.match(html, /골키퍼/); assert.match(html, /&lt;공격&gt; · MVP/);
  state.matches[0].sport = 'running';
  state.resultProposals[0].data = { attendedIds: ['a', 'b'], entries: { a: { distanceKm: '5.25', paceSec: 365 }, b: { distanceKm: '3', paceSec: 390 } }, reviews: { a: '<script>후기</script>', b: '천천히 달림' } };
  html = chat.render();
  assert.match(html, /5.25km · 6′05″\/km/);
  assert.match(html, /3km · 6′30″\/km/);
  assert.match(html, /&lt;script&gt;후기&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /천천히 달림/);
  assert.match(html, /셋째 · 불참으로 제안/);
  chat.dispose();
});

test('sending ahead of the poll cursor never skips an unseen interleaved peer message', async () => {
  const chat = controller({ request: async (path, payload) => {
    if (path === '/api/chats') return { rooms: [room] };
    if (payload) return { message: { id: 12, roomId: room.id, senderId: 'a', text: payload.text } };
    const cursor = new URL(path, 'https://local.invalid').searchParams.get('after');
    const messages = cursor === null ? [{ id: 10, senderId: 'b', text: '처음 읽은 메시지' }] : [{ id: 11, senderId: 'b', text: '폴링 전에 먼저 온 친구 메시지' }, { id: 12, senderId: 'a', text: '내 답장' }].filter(message => message.id > Number(cursor));
    return { messages, cursor: messages.at(-1)?.id ?? Number(cursor) };
  } });
  const dom = surface(); chat.setRoom(room.id); await chat.mount(dom.root);
  const input = { value: '내 답장' }, form = { id: 'chat-message-form', elements: { namedItem: () => input }, querySelector: () => null };
  await chat.handleSubmit(form);
  await chat.mount(dom.root);
  assert.match(dom.lane.innerHTML, /폴링 전에 먼저 온 친구 메시지/);
  assert.equal((dom.lane.innerHTML.match(/data-message-id="12"/g) || []).length, 1);
  chat.dispose();
});
