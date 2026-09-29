import * as d from './extended-domain.js';
import { today, SPORT_LABEL, SPORTS } from './domain.js';

function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
}
function write(ctx, value, x, y, size, color = '#173d2c', weight = 700, maxWidth = Infinity) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Arial, "Malgun Gothic", sans-serif`;
  const plain = String(value ?? '').replace(/\s+/g, ' ').trim();
  let text = plain;
  if (ctx.measureText(text).width > maxWidth) {
    const letters = Array.from(text);
    while (letters.length && ctx.measureText(`${letters.join('')}…`).width > maxWidth) letters.pop();
    text = `${letters.join('')}…`;
  }
  ctx.fillText(text, x, y);
}
function loadPhoto(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('프로필 사진을 카드에 불러오지 못했습니다. 다시 시도해 주세요.')), 5000);
    image.onload = () => finish(image.naturalWidth ? null : new Error('프로필 사진을 읽을 수 없습니다.'));
    image.onerror = () => finish(new Error('프로필 사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.'));
    image.src = dataUrl;
    if (image.complete && image.naturalWidth) finish(null);
  });
}
async function drawAvatar(ctx, user) {
  const image = user.photo ? await loadPhoto(user.photo) : null;
  ctx.save();
  try {
    ctx.beginPath(); ctx.arc(1030, 155, 61, 0, Math.PI * 2); ctx.clip();
    if (image) ctx.drawImage(image, 969, 94, 122, 122);
    else {
      ctx.fillStyle = '#c8e78a'; ctx.fillRect(969, 94, 122, 122);
      write(ctx, user.avatar, 1000, 174, 62, '#3a7241', 700, 90);
    }
  } finally { ctx.restore(); }
}
function todayLines(state, userId) {
  const activities = d.activityFor(state, userId);
  return SPORTS.map((sport) => {
    const items = activities.filter(({ match }) => match.sport === sport);
    if (!items.length) return null;
    const completed = items.filter(({ result }) => result && result.attendedIds.includes(userId)).length;
    const first = items[0].match;
    const extra = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
    return `${SPORT_LABEL[sport]} ${items.length}건${completed ? ` · 완료 ${completed}` : ''}  |  ${first.startTime} ${first.title}${extra}`;
  }).filter(Boolean);
}
export async function makeCard(state, user, kind) {
  if (!['profile', 'today'].includes(kind)) throw new Error('카드 종류를 확인해 주세요.');
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지 캔버스를 사용할 수 없습니다.');
  ctx.fillStyle = '#f8f9ef'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#e4efcf'; ctx.beginPath(); ctx.arc(1080, 525, 270, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b5d49b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1080, 525, 220, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#173d2c'; rounded(ctx, 42, 40, 1116, 550, 28);
  ctx.fillStyle = '#d7efa7'; ctx.beginPath(); ctx.arc(1085, 510, 230, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a4cf77'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(1085, 510, 170, 0, Math.PI * 2); ctx.stroke();
  write(ctx, 'DWNC ✳', 86, 112, 34, '#d7efa7', 900);
  write(ctx, kind === 'today' ? 'TODAY IN MOTION' : 'MY PLAY CARD', 88, 155, 17, '#a5c89d', 800);
  await drawAvatar(ctx, user);
  if (kind === 'profile') {
    write(ctx, user.name, 85, 260, 64, '#ffffff', 900, 825);
    write(ctx, `${user.region}  ·  함께 운동하는 사람`, 88, 309, 22, '#c5d7c0', 500, 810);
    const stats = d.statsFor(state, user.id);
    const lines = user.chosenSports.map((sport) => sport === 'tennis'
      ? `테니스  ${stats.tennis.wins}승 ${stats.tennis.losses}패  ·  승률 ${stats.tennis.winRate}%`
      : sport === 'futsal'
        ? `풋살  ${stats.futsal.games}경기  ·  MVP ${stats.futsal.mvp}회`
        : `러닝  ${stats.running.distanceKm}km  ·  ${stats.running.runs}회`);
    lines.forEach((line, index) => write(ctx, line, 89, 377 + index * 46, 23, '#ecf4e8', 600, 795));
    write(ctx, `매너 ${d.mannerFor(state, user.id).toFixed(1)}   ·   ${user.friendCode}`, 88, 552, 18, '#b8df9e', 700, 780);
  } else {
    write(ctx, `${user.name}님의 오늘`, 85, 257, 57, '#ffffff', 900, 825);
    write(ctx, today(), 88, 301, 22, '#c5d7c0', 500);
    const lines = todayLines(state, user.id);
    const count = d.activityFor(state, user.id).length;
    if (!lines.length) write(ctx, '오늘의 운동을 함께 시작해요.', 88, 373, 25, '#ecf4e8', 600, 795);
    else {
      write(ctx, `오늘의 운동 ${count}건 · ${lines.length}종목`, 88, 353, 22, '#b8df9e', 700, 795);
      lines.forEach((line, index) => write(ctx, line, 89, 403 + index * 43, 21, '#ecf4e8', 600, 795));
    }
    const note = state.dailyNotes[user.id]?.[today()] || '오늘도 좋은 움직임을!';
    write(ctx, note, 88, 552, 20, '#b8df9e', 700, 780);
  }
  write(ctx, 'MOVE WITH SOMEONE', 900, 552, 15, '#285636', 900, 215);
  return canvas.toDataURL('image/png');
}
