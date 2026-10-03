import { test, expect as playwrightExpect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../dwnc-app/server.js';
import { randomUUID } from 'node:crypto';
import { koreaToday } from '../dwnc-app/kong-profile.js';

const origin = 'http://127.0.0.1:4191';
// A four-second polling interval needs room for request/paint latency on the shared host.
const expect = playwrightExpect.configure({ timeout: 10000 });
let application, directory;
test.use({ baseURL: origin, actionTimeout: 10000 });
test.beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'dwnc-consensus-browser-'));
  application = await createApplication({ databasePath: path.join(directory, 'test.sqlite'), baseURL: origin, production: false });
  await new Promise(resolve => application.server.listen(4191, '127.0.0.1', resolve));
});
test.afterEach(async () => {
  if (application) await application.close();
  if (directory) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('Unsafe cleanup path');
    rmSync(directory, { recursive: true, force: true });
  }
});

async function signup(page, name, suffix) {
  const response = await page.request.post(`${origin}/api/auth/sign-up/email`, {
    headers: { Origin: origin }, data: { name, email: `${suffix}@example.test`, password: 'Consensus-fictional-583!' },
  });
  expect(response.status()).toBe(200);
  return (await snapshot(page)).state.activeUserId;
}

async function snapshot(page) {
  const response = await page.request.get(`${origin}/api/state`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function setupCommand(page, type, payload) {
  const { revision, state } = await snapshot(page);
  const response = await page.request.post(`${origin}/api/commands`, { headers: { Origin: origin }, data: { type, payload, revision, expectedUserId: state.activeUserId, requestId: randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function commandFromUI(page, type, action) {
  const waiting = page.waitForResponse(response => response.url().endsWith('/api/commands') && response.request().method() === 'POST' && response.request().postDataJSON().type === type);
  await action(); const response = await waiting;
  expect(response.status(), await response.text()).toBe(200);
  const result = await response.json();
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  return result;
}
async function openDirect(page, peerId) {
  await page.goto('/#/community?tab=friends');
  await page.locator(`.content button.row[data-action="view-profile"][data-id="${peerId}"]`).click();
  const waiting = page.waitForResponse(response => response.url().endsWith('/api/chats/open') && response.request().method() === 'POST');
  await page.locator('[role="dialog"] [data-action="open-chat"][data-kind="direct"]').click();
  const response = await waiting; expect(response.status()).toBe(200);
  const { room } = await response.json();
  await expect(page.locator('[data-chat-view]')).toHaveAttribute('data-chat-room', room.id);
  await expect(page.locator('[data-action="chat-appointment"]')).toBeEnabled();
  return room;
}
async function openGroup(page, groupId) {
  await page.goto('/#/community?tab=groups');
  await page.locator(`[data-action="group-detail"][data-id="${groupId}"]`).click();
  const waiting = page.waitForResponse(response => response.url().endsWith('/api/chats/open') && response.request().method() === 'POST');
  await page.locator('[role="dialog"] [data-action="open-chat"][data-kind="group"]').click();
  const response = await waiting; expect(response.status()).toBe(200);
  const { room } = await response.json();
  await expect(page.locator('[data-chat-view]')).toHaveAttribute('data-chat-room', room.id);
  await expect(page.locator('[data-action="chat-appointment"]')).toBeEnabled();
  return room;
}
async function sendText(page, text) {
  await page.locator('#chat-message-text').fill(text);
  const waiting = page.waitForResponse(response => /\/api\/chats\/[^/]+\/messages$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
  await page.locator('#chat-message-form button[type="submit"]').click();
  const response = await waiting; expect(response.status()).toBe(200);
  await expect(page.locator('#chat-message-text')).toHaveValue('');
  return (await response.json()).message;
}
const tomorrow = () => { const date = new Date(`${koreaToday()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };
async function fillAppointment(page, { title, sport = 'running', date = tomorrow(), address = '서울 관악구 허구 주소 12', startTime = '18:00', endTime = '19:00' }) {
  const form = page.locator('#chat-appointment-form');
  await form.locator('[name="sport"]').selectOption(sport);
  for (const [field, value] of Object.entries({ title, date, startTime, endTime, region: '관악구', venue: '합의 공원', address, description: '브라우저에서 서로 확인한 약속' })) await form.locator(`[name="${field}"]`).fill(value);
  return form;
}
async function confirmAppointment(page, proposal) {
  const card = page.locator(`[data-proposal-id="${proposal.id}"]`);
  await expect(card).toContainText(`${proposal.approvedIds.length}/${proposal.participantIds.length}명 승인`);
  return commandFromUI(page, 'appointment.decide', () => card.locator('[data-action="chat-appointment-accept"]').click());
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  expect(await page.locator('#app').evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
}

test('persisted chat lives inside community and retains exactly four mobile navigation entries', async ({ page }) => {
  await signup(page, '채팅 시연', 'chat-shell');
  await page.goto('/#/community?tab=chats');
  await expect(page.locator('.content[data-page="community"]')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '하단 메뉴' }).locator('a')).toHaveCount(4);
  await expect(page.locator('[data-action="community-tab"][data-id="chats"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-community-tab="chats"]')).toBeVisible();
});

test('friends exchange persistent text and mutually change a private closed appointment without losing the composer', async ({ browser, page }) => {
  test.setTimeout(60000);
  const peerContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), outsiderContext = await browser.newContext();
  peerContext.setDefaultTimeout(10000);
  const peer = await peerContext.newPage(), outsider = await outsiderContext.newPage(), errors = [];
  for (const actor of [page, peer]) actor.on('pageerror', error => errors.push(error.message));
  try {
    const a = await signup(page, '약속 제안자', 'direct-a'), b = await signup(peer, '약속 친구', 'direct-b');
    await signup(outsider, '대화 외부인', 'direct-outsider');
    const peerProfile = (await snapshot(peer)).state.users.find(person => person.id === b);
    await setupCommand(page, 'friend.request', { code: peerProfile.friendCode });
    const friendRequest = (await snapshot(peer)).state.friendRequests.find(item => item.fromId === a && item.status === 'pending');
    await setupCommand(peer, 'friend.decide', { requestId: friendRequest.id, decision: 'accepted' });
    const room = await openDirect(page, b);
    expect((await openDirect(peer, a)).id).toBe(room.id);
    const revision = (await snapshot(page)).revision;
    const greeting = '<함께> 운동해요\n' + '오래 남길 대화 내용입니다.\n'.repeat(10);
    const first = await sendText(page, greeting);
    await expect(peer.locator('[data-chat-messages]')).toContainText('<함께> 운동해요');
    await sendText(peer, '좋아요, 약속 시간을 함께 정해요.\n' + '친구가 답한 대화 내용입니다.\n'.repeat(10));
    await expect(page.locator('[data-chat-messages]')).toContainText('약속 시간을 함께 정해요.');
    await page.locator('#chat-message-text').fill('작성 중인 메시지 보존');
    await page.locator('#chat-message-text').focus();
    await page.locator('#chat-message-text').evaluate(node => node.setSelectionRange(3, 3));
    await page.locator('[data-chat-messages]').evaluate(node => { node.scrollTop = 40; });
    const scroll = await page.locator('[data-chat-messages]').evaluate(node => node.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    const nextPoll = page.waitForResponse(response => new URL(response.url()).pathname === `/api/chats/${room.id}/messages` && response.request().method() === 'GET' && response.url().includes('after='));
    await sendText(peer, '폴링 중에 도착한 새 메시지');
    await nextPoll;
    await expect(page.locator('[data-chat-messages]')).toContainText('폴링 중에 도착한 새 메시지');
    await expect(page.locator('#chat-message-text')).toHaveValue('작성 중인 메시지 보존');
    await expect(page.locator('#chat-message-text')).toBeFocused();
    expect(await page.locator('#chat-message-text').evaluate(node => node.selectionStart)).toBe(3);
    expect(await page.locator('[data-chat-messages]').evaluate(node => node.scrollTop)).toBe(scroll);
    expect((await snapshot(page)).revision).toBe(revision);
    const forbidden = await outsider.request.get(`${origin}/api/chats/${room.id}/messages`);
    expect([403, 404]).toContain(forbidden.status());
    expect(await forbidden.json()).not.toHaveProperty('messages');

    await page.locator('[data-action="chat-appointment"]').click();
    const form = await fillAppointment(page, { title: '친구끼리 확정 약속', sport: 'tennis' });
    await expect(form.locator('[name="participantIds"]')).toHaveCount(2);
    const original = await commandFromUI(page, 'appointment.propose', () => form.locator('button[type="submit"]').click());
    const proposal = original.state.appointmentProposals.find(item => item.id === original.id);
    expect(proposal.approvedIds).toEqual([a]);
    expect(original.state.matches.some(item => item.title === '친구끼리 확정 약속')).toBe(false);
    await expect(peer.locator(`[data-proposal-id="${proposal.id}"]`)).toContainText('1/2명 승인');
    await peer.locator(`[data-proposal-id="${proposal.id}"] [data-action="chat-change"]`).click();
    const changedForm = peer.locator('#chat-appointment-form');
    await expect(changedForm).toContainText('이전 동의가 초기화');
    await changedForm.locator('[name="startTime"]').fill('19:30');
    await changedForm.locator('[name="endTime"]').fill('20:30');
    await changedForm.locator('[name="address"]').fill('서울 관악구 새로운 허구 주소 34');
    const changed = await commandFromUI(peer, 'appointment.propose', () => changedForm.locator('button[type="submit"]').click());
    const next = changed.state.appointmentProposals.find(item => item.id === changed.id);
    expect(next.version).toBe(2); expect(next.approvedIds).toEqual([b]);
    expect(changed.state.appointmentProposals.find(item => item.id === proposal.id).status).toBe('superseded');
    expect(changed.state.matches.some(item => item.title === '친구끼리 확정 약속')).toBe(false);
    const card = page.locator(`[data-proposal-id="${next.id}"]`);
    await expect(card).toContainText('19:30–20:30');
    await expect(card).toContainText('서울 관악구 새로운 허구 주소 34');
    const map = new URL(await card.getByRole('link', { name: '지도 열기 ↗' }).getAttribute('href'));
    expect(map.origin + map.pathname).toBe('https://www.google.com/maps/search/');
    expect(map.searchParams.get('api')).toBe('1');
    expect(map.searchParams.get('query')).toBe('관악구 합의 공원 서울 관악구 새로운 허구 주소 34');
    const agreed = await confirmAppointment(page, next);
    const match = agreed.state.matches.find(item => item.title === '친구끼리 확정 약속');
    expect(match.participantOnly).toBe(true); expect(match.recruitmentClosed).toBe(true);
    expect(match.agreedParticipantIds.slice().sort()).toEqual([a, b].sort());
    expect(match.startTime).toBe('19:30'); expect(match.address).toBe('서울 관악구 새로운 허구 주소 34');
    expect((await snapshot(outsider)).state.matches.some(item => item.id === match.id)).toBe(false);
    await expect(peer.locator(`[data-proposal-id="${next.id}"]`)).toContainText('확정');
    for (const actor of [page, peer]) {
      await actor.goto('/#/matches');
      const schedule = actor.locator(`.schedule-section [data-action="details"][data-id="${match.id}"]`);
      await expect(schedule).toHaveCount(1); await expect(schedule).toBeVisible();
      await schedule.click(); await expect(actor.locator('[role="dialog"]')).toContainText('참가자만');
      await actor.getByRole('button', { name: '닫기', exact: true }).click();
      await actor.reload(); await expect(actor.locator(`.schedule-section [data-id="${match.id}"]`)).toHaveCount(1);
    }
    await page.goto(`/#/community?tab=chats&room=${room.id}`);
    await expect(page.locator(`[data-message-id="${first.id}"]`)).toContainText('<함께> 운동해요');
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(page); }
    expect(errors).toEqual([]);
  } finally { await peerContext.close(); await outsiderContext.close(); }
});

test('three group members approve schedule and frozen running result before actual peer stars and once-only history', async ({ browser, page }) => {
  test.setTimeout(60000);
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), thirdContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  secondContext.setDefaultTimeout(10000); thirdContext.setDefaultTimeout(10000);
  const second = await secondContext.newPage(), third = await thirdContext.newPage(), errors = [];
  for (const actor of [page, second, third]) actor.on('pageerror', error => errors.push(error.message));
  try {
    const a = await signup(page, '그룹 제안자', 'group-a'), b = await signup(second, '함께 달린 친구', 'group-b'), c = await signup(third, '불참 확인자', 'group-c');
    const group = await setupCommand(page, 'group.create', { name: '브라우저 전원 합의 그룹', region: '관악구', description: '세 사람이 직접 확인해요' });
    await setupCommand(second, 'group.join', { groupId: group.id });
    await setupCommand(third, 'group.join', { groupId: group.id });
    const room = await openGroup(page, group.id);
    expect((await openGroup(second, group.id)).id).toBe(room.id);
    expect((await openGroup(third, group.id)).id).toBe(room.id);
    await page.locator('[data-action="chat-appointment"]').click();
    const date = tomorrow(), form = await fillAppointment(page, { title: '세 사람 전원 합의 러닝', date });
    await expect(form.locator('[name="participantIds"]:checked')).toHaveCount(3);
    await expect(form.locator(`[name="participantIds"][value="${a}"]`)).toBeDisabled();
    const proposed = await commandFromUI(page, 'appointment.propose', () => form.locator('button[type="submit"]').click());
    let appointment = proposed.state.appointmentProposals.find(item => item.id === proposed.id);
    expect(appointment.participantIds.slice().sort()).toEqual([a, b, c].sort());
    expect(proposed.state.matches.some(item => item.title === '세 사람 전원 합의 러닝')).toBe(false);
    const secondApproval = await confirmAppointment(second, appointment);
    appointment = secondApproval.state.appointmentProposals.find(item => item.id === appointment.id);
    expect(appointment.approvedIds).toHaveLength(2);
    expect(secondApproval.state.matches.some(item => item.title === '세 사람 전원 합의 러닝')).toBe(false);
    const finalApproval = await confirmAppointment(third, appointment);
    const match = finalApproval.state.matches.find(item => item.title === '세 사람 전원 합의 러닝');
    expect(match.agreedParticipantIds.slice().sort()).toEqual([a, b, c].sort());
    expect(finalApproval.state.matches.filter(item => item.id === match.id)).toHaveLength(1);
    await expect(page.locator(`[data-proposal-id="${appointment.id}"]`)).toContainText('확정');

    // Date only advances to the fictional workout day; actual polling timers and server clock are unchanged.
    for (const actor of [page, second, third]) await actor.clock.setFixedTime(new Date(`${date}T21:00:00+09:00`));
    await page.goto('/#/matches');
    await page.locator('.unfinished-records summary').click();
    await page.locator(`.schedule-section [data-action="details"][data-id="${match.id}"]`).click();
    await page.locator('[role="dialog"] [data-action="result"]').click();
    const resultForm = page.locator('#result-form');
    const absentInput = resultForm.locator(`[name="attended"][value="${c}"]`);
    await resultForm.locator(`label.person-chip:has([name="attended"][value="${c}"])`).click();
    await expect(absentInput).not.toBeChecked();
    await resultForm.locator(`[name="distance-${a}"]`).fill('5.2'); await resultForm.locator(`[name="pace-${a}"]`).fill('06:05');
    await resultForm.locator(`[name="review-${a}"]`).fill('<상쾌함> 함께 달렸어요');
    await resultForm.locator(`[name="distance-${b}"]`).fill('3'); await resultForm.locator(`[name="pace-${b}"]`).fill('06:30');
    await resultForm.locator(`[name="review-${b}"]`).fill('천천히 달림');
    const saved = await commandFromUI(page, 'result.save', () => resultForm.locator('button[type="submit"]').click());
    const resultProposal = saved.state.resultProposals.find(item => item.id === saved.id);
    expect(resultProposal.participantIds.slice().sort()).toEqual([a, b, c].sort());
    expect(resultProposal.data.attendedIds.slice().sort()).toEqual([a, b].sort());
    expect(saved.state.results.some(item => item.matchId === match.id)).toBe(false);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.goto('/#/home');
    await expect(page.locator('.kong-profile')).toHaveAttribute('data-total', '0');
    await expect(page.locator('.kong-history .kong-log-row')).toHaveCount(0);

    const secondCard = second.locator(`[data-proposal-id="${resultProposal.id}"]`);
    await expect(secondCard).toContainText('1/3명 승인');
    await expect(secondCard).toContainText('5.2km · 6′05″/km');
    await expect(secondCard).toContainText('<상쾌함> 함께 달렸어요');
    await expect(secondCard).toContainText('불참 확인자 · 불참으로 제안');
    const agreedResult = await commandFromUI(second, 'result.decide', () => secondCard.locator('[data-action="chat-result-accept"]').click());
    expect(agreedResult.state.results.some(item => item.matchId === match.id)).toBe(false);
    expect(agreedResult.state.resultProposals.find(item => item.id === resultProposal.id).approvedIds).toHaveLength(2);
    await second.goto('/#/home');
    await expect(second.locator('.kong-profile')).toHaveAttribute('data-total', '0');
    await expect(second.locator('.kong-history .kong-log-row')).toHaveCount(0);

    const thirdCard = third.locator(`[data-proposal-id="${resultProposal.id}"]`);
    await expect(thirdCard).toContainText('2/3명 승인');
    await expect(thirdCard).toContainText('불참 확인자 · 불참으로 제안');
    const confirmed = await commandFromUI(third, 'result.decide', () => thirdCard.locator('[data-action="chat-result-accept"]').click());
    expect(confirmed.state.results.filter(item => item.matchId === match.id)).toHaveLength(1);
    expect(confirmed.state.results.find(item => item.matchId === match.id).attendedIds).not.toContain(c);
    for (const actor of [page, second]) {
      const refresh = actor.waitForResponse(response => new URL(response.url()).pathname === '/api/state' && response.request().method() === 'GET');
      await actor.getByRole('button', { name: '새로고침', exact: true }).click(); await refresh;
      await expect(actor.locator('.kong-profile')).toHaveAttribute('data-total', '1');
      await expect(actor.locator('.passport-flip')).toHaveAttribute('data-flipped', 'true');
      await expect(actor.locator('.kong-history .kong-log-row')).toHaveCount(1);
      await actor.reload();
      await expect(actor.locator('.kong-profile')).toHaveAttribute('data-total', '1');
      await expect(actor.locator('.passport-flip')).toHaveAttribute('data-flipped', 'false');
      await expect(actor.locator('.kong-history .kong-log-row')).toHaveCount(1);
    }
    await third.goto('/#/home');
    await expect(third.locator('.kong-profile')).toHaveAttribute('data-total', '0');
    expect((await snapshot(page)).state.results.filter(item => item.matchId === match.id)).toHaveLength(1);

    await page.goto('/#/matches');
    await page.locator('.schedule-section [data-action="recent-records"]').click();
    await page.locator(`.activity-records .block .rows [data-action="details"][data-id="${match.id}"]`).click();
    const rating = page.locator(`.rate-form[data-target="${b}"]`);
    const beforeStars = (await snapshot(page)).revision;
    await rating.locator('label').filter({ has: page.locator('[name="value"][value="4"]') }).click();
    expect((await snapshot(page)).revision).toBe(beforeStars);
    const rated = await commandFromUI(page, 'rating.save', () => rating.getByRole('button', { name: '평가 남기기' }).click());
    expect(rated.state.users.find(person => person.id === b).publicMannerSummary).toEqual({ average: 4, count: 1 });
    await expect(page.locator('[role="dialog"]')).toContainText('4/5 · 평가 완료');
    await expect(page.locator(`.rate-form[data-target="${b}"]`)).toHaveCount(0);
    await expect(page.locator(`.rate-form[data-target="${c}"]`)).toHaveCount(0);
    await page.locator(`[role="dialog"] .people.compact button.person[data-action="view-profile"][data-id="${b}"]`).click();
    await expect(page.locator('[role="dialog"] .passport-manner-value')).toHaveText('4.0 / 5 · 1건');
    await expect(page.locator('[role="dialog"] .passport-manner-stars')).toHaveAttribute('aria-label', /4\.0점, 실제 평가 1건/);
    await second.reload(); await expect(second.locator('.passport-manner-value')).toHaveText('4.0 / 5 · 1건');
    expect(errors).toEqual([]);
  } finally { await secondContext.close(); await thirdContext.close(); }
});
