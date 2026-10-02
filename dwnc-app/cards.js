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
const SPORT_COLOR = { tennis: '#c7e78a', futsal: '#eac79a', running: '#8fd6bd' };
const SPORT_GLYPH = { tennis: '◎', futsal: '✳', running: '↗' };
function paceText(seconds) { return seconds ? `${Math.floor(seconds / 60)}′${String(seconds % 60).padStart(2, '0')}″` : '—'; }
function todayLines(state, userId) {
  const activities = d.activityFor(state, userId);
  return SPORTS.map((sport) => {
    const items = activities.filter(({ match }) => match.sport === sport);
    if (!items.length) return null;
    const completed = items.filter(({ result }) => result && result.attendedIds.includes(userId)).length;
    const first = items[0].match;
    const extra = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
    return { sport, text: `${SPORT_LABEL[sport]} ${items.length}건${completed ? ` · 완료 ${completed}` : ''}  |  ${first.startTime} ${first.title}${extra}` };
  }).filter(Boolean);
}
const STAMP_INK = { tennis: '#6aa33a', futsal: '#c08540', running: '#2f9b78' };
const BAR = { tennis: '#9ccf5b', futsal: '#d9a868', running: '#5fbd9c' };
const CODE = { tennis: 'TEN', futsal: 'FUT', running: 'RUN' };
const dotDate = (date) => date ? date.replaceAll('-', '.') : '아직 없음';
function centered(ctx, value, x, y, size, color, weight, maxWidth) { ctx.textAlign = 'center'; write(ctx, value, x, y, size, color, weight, maxWidth); ctx.textAlign = 'left'; }
function metricFor(stats, sport) {
  if (sport === 'tennis') return [stats.tennis.games ? `${stats.tennis.winRate}%` : '—', `승률 · ${stats.tennis.wins}승 ${stats.tennis.losses}패`];
  if (sport === 'futsal') return [String(stats.futsal.mvp), `MVP · ${stats.futsal.games}경기`];
  return [paceText(stats.running.paceSec), `페이스 · ${stats.running.distanceKm}km`];
}
function stampText({ match, result }, userId) {
  if (match.sport === 'tennis') return result.noContest ? '경기 미성립' : result.teams[result.winnerTeam].includes(userId) ? '승리' : '패배';
  if (match.sport === 'futsal') return `${result.teamOutcome === 'win' ? '승' : result.teamOutcome === 'loss' ? '패' : '무'} ${result.scoreFor}:${result.scoreAgainst}${result.mvpUserId === userId ? ' · MVP' : ''}`;
  return `${result.entries[userId]?.distanceKm ?? 0}km`;
}
function drawStamp(ctx, x, y, tilt, ink, lines) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt * Math.PI / 180);
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.stroke();
  lines.forEach(([text, dy, size, color, weight]) => centered(ctx, text, 0, dy, size, color, weight, 114));
  ctx.restore();
}
async function drawPhotoBox(ctx, user, x, y, width, height) {
  const image = user.photo ? await loadPhoto(user.photo) : null;
  ctx.save();
  try {
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 14); ctx.clip();
    ctx.fillStyle = '#d7efa7'; ctx.fillRect(x, y, width, height);
    if (image) { const side = Math.min(image.width, image.height * width / height); ctx.drawImage(image, (image.width - side) / 2, (image.height - side * height / width) / 2, side, side * height / width, x, y, width, height); }
    else centered(ctx, user.avatar, x + width / 2, y + height / 2 + 22, 64, '#3a7241', 700);
  } finally { ctx.restore(); }
}
// Passport-like two-page spread, matching the in-app profile layout.
async function drawProfileBook(ctx, state, user) {
  const identity = d.sportIdentity(state, user.id), book = d.stampsFor(state, user.id);
  ctx.fillStyle = '#e9efdc'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#fffdf6'; rounded(ctx, 36, 34, 1128, 562, 30);
  ctx.strokeStyle = '#d6dfc8'; ctx.lineWidth = 2; ctx.setLineDash([9, 7]); ctx.beginPath(); ctx.moveTo(600, 64); ctx.lineTo(600, 566); ctx.stroke(); ctx.setLineDash([]);
  write(ctx, 'DWNC ✳ PLAYER', 76, 92, 16, '#6f8f62', 900);
  ctx.textAlign = 'right'; write(ctx, `No. ${user.friendCode}`, 566, 92, 17, '#2f5a3c', 700); ctx.textAlign = 'left';
  await drawPhotoBox(ctx, user, 76, 120, 132, 168);
  const label = (text, x, y) => write(ctx, text, x, y, 14, '#84967f', 700);
  label('이름', 234, 138); write(ctx, user.name, 234, 184, 44, '#193f2d', 900, 330);
  label('활동 지역', 234, 222); write(ctx, user.region, 234, 248, 20, '#193f2d', 800, 150);
  label('첫 기록', 400, 222); write(ctx, dotDate(book.since), 400, 248, 20, '#193f2d', 800, 166);
  label('매너', 234, 276); write(ctx, d.mannerFor(state, user.id).toFixed(1), 234, 300, 20, '#193f2d', 800);
  label('함께 운동한 사람', 400, 276); write(ctx, `${identity.partners}명`, 400, 300, 20, '#193f2d', 800);
  identity.sports.forEach((item, index) => {
    const top = 322 + index * 70, detail = user.sports[item.sport], [value, sub] = metricFor(identity.stats, item.sport);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#e3eadb'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(76, top, 490, 60, [0, 12, 12, 0]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = BAR[item.sport]; ctx.fillRect(76, top, 6, 60);
    write(ctx, `${SPORT_GLYPH[item.sport]}  ${SPORT_LABEL[item.sport]}  ${detail.level}`, 100, top + 27, 20, '#193f2d', 800, 250);
    write(ctx, `${detail.experience} · ${detail.preference}${item.sport === 'tennis' ? ` · NTRP ${detail.ntrp}` : ''}`, 100, top + 50, 14, '#7d907e', 600, 250);
    ctx.textAlign = 'right'; write(ctx, value, 548, top + 30, 26, '#193f2d', 900, 180); write(ctx, sub, 548, top + 50, 14, '#7d907e', 600, 200); ctx.textAlign = 'left';
  });
  const mrz = `DWNC<<${user.friendCode.replace(/[^A-Z0-9]/g, '')}<<${user.chosenSports.map((sport) => CODE[sport]).join('<')}`.padEnd(40, '<').slice(0, 40);
  write(ctx, mrz, 76, 562, 16, '#a7b49f', 600, 490);
  write(ctx, 'STAMPS', 640, 92, 16, '#6f8f62', 900);
  ctx.textAlign = 'right'; write(ctx, `도장 ${book.stamps.length} · 구장 ${book.venues} · 동네 ${book.regions}`, 1124, 92, 17, '#5c7660', 700); ctx.textAlign = 'left';
  const slots = [[718, 214], [882, 214], [1046, 214], [718, 396], [882, 396], [1046, 396]], tilts = [-7, 5, -3, 8, -5, 3];
  book.stamps.slice(0, 6).forEach((stamp, index) => {
    const [x, y] = slots[index], ink = STAMP_INK[stamp.match.sport], hidden = stamp.match.visibility !== 'public';
    drawStamp(ctx, x, y, tilts[index], ink, [[`${SPORT_GLYPH[stamp.match.sport]} ${SPORT_LABEL[stamp.match.sport]}`, -26, 14, ink, 800], [hidden ? '멤버 기록' : stamp.match.venue, -2, 15, '#193f2d', 900], [stampText(stamp, user.id), 22, 15, ink, 800], [dotDate(stamp.match.date).slice(5), 44, 13, '#6c7f6c', 600]]);
  });
  if (book.stamps.length < 6) { const [x, y] = slots[book.stamps.length]; drawStamp(ctx, x, y, 0, '#c3ccbc', [['다음 도장', 4, 17, '#8a9a86', 800], ['새 구장 · 새 종목', 28, 13, '#a3b09e', 600]]); }
  write(ctx, book.stamps.length > 6 ? `외 ${book.stamps.length - 6}개의 도장` : '같이 운동한 구장마다 도장 하나', 640, 562, 16, '#7d907e', 700, 300);
  ctx.textAlign = 'right'; write(ctx, 'MOVE WITH SOMEONE', 1124, 562, 14, '#6f8f62', 900); ctx.textAlign = 'left';
}
export async function makeCard(state, user, kind) {
  if (!['profile', 'today'].includes(kind)) throw new Error('카드 종류를 확인해 주세요.');
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지 캔버스를 사용할 수 없습니다.');
  if (kind === 'profile') { await drawProfileBook(ctx, state, user); return canvas.toDataURL('image/png'); }
  ctx.fillStyle = '#f8f9ef'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#e4efcf'; ctx.beginPath(); ctx.arc(1080, 525, 270, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b5d49b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1080, 525, 220, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#173d2c'; rounded(ctx, 42, 40, 1116, 550, 28);
  ctx.fillStyle = '#d7efa7'; ctx.beginPath(); ctx.arc(1085, 510, 230, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a4cf77'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(1085, 510, 170, 0, Math.PI * 2); ctx.stroke();
  write(ctx, 'DWNC ✳', 86, 112, 34, '#d7efa7', 900);
  write(ctx, 'TODAY IN MOTION', 88, 155, 17, '#a5c89d', 800);
  await drawAvatar(ctx, user);
  write(ctx, `${user.name}님의 오늘`, 85, 257, 57, '#ffffff', 900, 825);
  write(ctx, today(), 88, 301, 22, '#c5d7c0', 500);
  const lines = todayLines(state, user.id);
  const count = d.activityFor(state, user.id).length;
  if (!lines.length) write(ctx, '오늘의 운동을 함께 시작해요.', 88, 373, 25, '#ecf4e8', 600, 795);
  else {
    write(ctx, `오늘의 운동 ${count}건 · ${lines.length}종목`, 88, 353, 22, '#b8df9e', 700, 795);
    lines.forEach((line, index) => {
      ctx.fillStyle = SPORT_COLOR[line.sport]; ctx.beginPath(); ctx.arc(96, 396 + index * 43, 7, 0, Math.PI * 2); ctx.fill();
      write(ctx, line.text, 114, 403 + index * 43, 21, '#ecf4e8', 600, 770);
    });
  }
  const note = state.dailyNotes[user.id]?.[today()] || '오늘도 좋은 움직임을!';
  write(ctx, note, 88, 552, 20, '#b8df9e', 700, 780);
  write(ctx, 'MOVE WITH SOMEONE', 900, 552, 15, '#285636', 900, 215);
  return canvas.toDataURL('image/png');
}
