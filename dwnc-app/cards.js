import { today, SPORT_LABEL } from './domain.js';
import { deriveKongProfile, koreaToday } from './kong-profile.js';

const INK = '#1a1c21', MUTED = '#59606a';
function write(ctx, value, x, y, size, color = INK, weight = 600, maxWidth = Infinity) {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px Arial, "Malgun Gothic", sans-serif`;
  let text = String(value ?? '').replace(/\s+/g,' ').trim();
  if (ctx.measureText(text).width > maxWidth) {
    const letters = Array.from(text);
    while (letters.length && ctx.measureText(`${letters.join('')}…`).width > maxWidth) letters.pop();
    text = `${letters.join('')}…`;
  }
  ctx.fillText(text,x,y);
}
function glass(ctx,x,y,width,height,radius=28) {
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(x,y,width,height,radius); ctx.fill(); ctx.stroke();
}
function background(ctx) {
  const gradient = ctx.createLinearGradient(0,0,1200,630);
  gradient.addColorStop(0,'#cdd0da'); gradient.addColorStop(.5,'#eaebef'); gradient.addColorStop(1,'#dce6d8');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,1200,630);
}
function loadPhoto(dataUrl) {
  return new Promise((resolve,reject)=>{
    const image = new Image(); let settled=false;
    const finish = error => { if(settled)return; settled=true; clearTimeout(timer); image.onload=null; image.onerror=null; error ? reject(error) : resolve(image); };
    const timer=setTimeout(()=>finish(new Error('프로필 사진을 카드에 불러오지 못했습니다. 다시 시도해 주세요.')),5000);
    image.onload=()=>finish(image.naturalWidth ? null : new Error('프로필 사진을 읽을 수 없습니다.'));
    image.onerror=()=>finish(new Error('프로필 사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.'));
    image.src=dataUrl; if(image.complete && image.naturalWidth)finish(null);
  });
}
async function photo(ctx,user,x,y,width,height) {
  const image=user.photo ? await loadPhoto(user.photo) : null;
  ctx.save();
  try {
    ctx.beginPath(); ctx.roundRect(x,y,width,height,20); ctx.clip(); ctx.fillStyle='#dce8d1'; ctx.fillRect(x,y,width,height);
    if(image) {
      const scale=Math.max(width/image.width,height/image.height), w=image.width*scale,h=image.height*scale;
      ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);
    } else write(ctx,user.avatar || user.name.slice(-1),x+width/2-30,y+height/2+22,64,'#347f42',600,90);
  } finally {ctx.restore();}
}
function resultText({match,result},userId) {
  if(match.sport==='running')return `${result.entries[userId]?.distanceKm ?? 0}km`;
  if(result.noContest)return '경기 미성립';
  if(match.sport==='tennis')return `${result.teams[result.winnerTeam].includes(userId)?'승리':'패배'} ${result.scoreA}:${result.scoreB}`;
  return `${{win:'승리',loss:'패배',draw:'무승부'}[result.teamOutcome]} ${result.scoreFor}:${result.scoreAgainst}`;
}
async function profile(ctx,state,user) {
  const derived=deriveKongProfile(state,user.id,koreaToday());
  glass(ctx,36,34,548,562); glass(ctx,608,34,556,562);
  write(ctx,'DWNC ✳  SPORT ID',72,86,18,MUTED,600); write(ctx,user.friendCode,364,86,16,MUTED,600,180);
  await photo(ctx,user,72,116,120,152);
  write(ctx,'닉네임',216,140,15,MUTED); write(ctx,user.name,216,187,40,INK,400,330);
  write(ctx,`${user.gender || '미입력'} · ${user.ageRange || '미입력'}`,216,223,18,MUTED,500,330);
  write(ctx,user.region,216,257,20,INK,600,330);
  write(ctx,user.bio,72,308,17,MUTED,500,476);
  user.chosenSports.forEach((sport,index)=>{
    const y=332+index*62, detail=user.sports[sport]; glass(ctx,72,y,476,52,14);
    write(ctx,SPORT_LABEL[sport],90,y+33,19,INK,600,92);
    write(ctx,`구력 ${detail.experience} · ${detail.level}`,192,y+33,17,MUTED,500,335);
  });
  write(ctx,`기록된 운동 ${derived.total}회`,72,562,19,INK,600,476);
  write(ctx,'운동 기록',644,88,26,INK,400); write(ctx,`최근 2주 ${derived.recent14}회`,960,88,17,MUTED,500,168);
  const max=Math.max(1,...derived.dailyCounts14.map(day=>day.count));
  derived.dailyCounts14.forEach((day,index)=>{
    const x=648+index*34,h=day.count ? 14+day.count/max*38 : 6;
    ctx.fillStyle=day.count ? '#78a96c' : 'rgba(89,96,106,.15)'; ctx.beginPath(); ctx.roundRect(x,160-h,18,h,9); ctx.fill();
  });
  write(ctx,derived.dailyCounts14[0].date.slice(5),648,184,14,MUTED,500); write(ctx,'오늘',1092,184,14,MUTED,500);
  const recent=derived.recentResults.slice(0,4);
  if(!recent.length)write(ctx,'첫 운동 기록을 기다리고 있어요.',648,268,22,MUTED,500,480);
  recent.forEach((record,index)=>{
    const y=208+index*76; glass(ctx,644,y,484,66,16);
    write(ctx,`${record.match.date.slice(5)} · ${SPORT_LABEL[record.match.sport]}`,660,y+27,16,MUTED,500,320);
    write(ctx,record.match.venue,660,y+51,18,INK,600,320);
    ctx.textAlign='right'; write(ctx,resultText(record,user.id),1110,y+41,17,INK,600,140); ctx.textAlign='left';
  });
  write(ctx,'MOVE WITH SOMEONE',644,562,15,MUTED,600,480);
}
async function daily(ctx,state,user) {
  glass(ctx,36,34,1128,562); await photo(ctx,user,996,72,124,140);
  write(ctx,'DWNC ✳  TODAY IN MOTION',76,94,22,MUTED,600,870);
  write(ctx,`${user.name}님의 오늘`,76,180,48,INK,400,840); write(ctx,today(),76,221,20,MUTED,500);
  const items=state.matches.filter(item=>item.date===today() && (item.hostId===user.id || item.applications.some(a=>a.userId===user.id && a.status==='accepted')));
  if(!items.length)write(ctx,'오늘의 운동을 함께 시작해요.',76,332,25,MUTED,500,1040);
  items.slice(0,3).forEach((item,index)=>{
    const y=262+index*76; glass(ctx,76,y,1044,60,16);
    write(ctx,`${item.startTime}  ${SPORT_LABEL[item.sport]} · ${item.title}`,96,y+36,21,INK,600,1004);
  });
  write(ctx,state.dailyNotes[user.id]?.[today()] || '오늘도 좋은 움직임을!',76,558,20,MUTED,500,1004);
}
export async function makeCard(state,user,kind) {
  if(!['profile','today'].includes(kind))throw new Error('카드 종류를 확인해 주세요.');
  const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=630;
  const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('이미지 캔버스를 사용할 수 없습니다.');
  background(ctx); if(kind==='profile')await profile(ctx,state,user); else await daily(ctx,state,user);
  return canvas.toDataURL('image/png');
}
