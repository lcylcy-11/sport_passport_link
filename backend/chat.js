import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readState, transaction } from './database.js';
import { ApiError } from './commands.js';
import * as c from '../dwnc-app/collaboration-domain.js';

const id=z.string().min(1).max(100);
const openSchema=z.strictObject({kind:z.enum(['direct','group','match']),peerId:id.optional(),groupId:id.optional(),matchId:id.optional(),expectedUserId:id,requestId:z.string().uuid()});
const messageSchema=z.strictObject({text:z.string().trim().min(1).max(1000),clientMessageId:z.string().uuid(),expectedUserId:id});
const parse=(schema,input) => { const p=schema.safeParse(input); if(!p.success) throw new ApiError(400,'입력 항목을 확인해 주세요.','INVALID_INPUT'); return p.data; };
const account=(p,actorId) => { if(p.expectedUserId!==actorId) throw new ApiError(409,'다른 계정으로 변경되었습니다.','SESSION_CHANGED'); };
const messageRow=row => row ? {id:Number(row.id),roomId:row.room_id,senderId:row.sender_id,text:row.text,createdAt:row.created_at} : undefined;

export function getRoom(db,state,actorId,roomId) {
 const row=db.prepare('SELECT payload FROM chat_rooms WHERE id=?').get(roomId);
 const room=row ? JSON.parse(row.payload) : null;
 if (!c.canAccessRoom(state,room,actorId)) throw new ApiError(404,'대화방을 찾을 수 없습니다.','NOT_FOUND');
 const projected={...room,participantIds:c.roomParticipants(state,room)};
 if(room.kind==='direct') { projected.peerId=room.participantIds.find(id=>id!==actorId); projected.title=state.users.find(u=>u.id===projected.peerId)?.name||'친구 대화'; }
 if(room.kind==='group') projected.title=state.groups.find(g=>g.id===room.groupId)?.name||'그룹 대화';
 if(room.kind==='match') projected.title=state.matches.find(m=>m.id===room.matchId)?.title||'운동 대화';
 return projected;
}
function withLastMessage(db,room) {
 const last=messageRow(db.prepare('SELECT * FROM chat_messages WHERE room_id=? ORDER BY id DESC LIMIT 1').get(room.id));
 return {...room,...(last?{lastMessage:last,updatedAt:last.createdAt}:{})};
}
export function listRooms(db,actorId) {
 const {state}=readState(db,actorId), rooms=[];
 for(const row of db.prepare('SELECT id FROM chat_rooms').all()) {
  try {rooms.push(withLastMessage(db,getRoom(db,state,actorId,row.id)));} catch(error) {if(!(error instanceof ApiError)) throw error;}
 }
 rooms.sort((a,b)=>(b.lastMessage?.id||0)-(a.lastMessage?.id||0)); return {rooms};
}
export function openRoom(db,actorId,input) {
 const p=parse(openSchema,input); account(p,actorId);
 return transaction(db,()=>{
  const {state}=readState(db,actorId);
  let context,room;
  if(p.kind==='direct') {
   if(!p.peerId || p.groupId || p.matchId || p.peerId===actorId) throw new ApiError(400,'친구를 선택해 주세요.','INVALID_INPUT');
   const participantIds=[actorId,p.peerId].sort(); context=JSON.stringify(['direct',...participantIds]); room={kind:p.kind,participantIds};
  } else if(p.kind==='group') {
   if(!p.groupId || p.peerId || p.matchId) throw new ApiError(400,'그룹을 선택해 주세요.','INVALID_INPUT');
   context=JSON.stringify(['group',p.groupId]); room={kind:p.kind,groupId:p.groupId,participantIds:[]};
  } else {
   if(!p.matchId || p.peerId || p.groupId) throw new ApiError(400,'운동을 선택해 주세요.','INVALID_INPUT');
   context=JSON.stringify(['match',p.matchId]); room={kind:p.kind,matchId:p.matchId,participantIds:[]};
  }
  if(!c.canAccessRoom(state,room,actorId)) throw new ApiError(404,'대화방을 찾을 수 없습니다.','NOT_FOUND');
  const old=db.prepare('SELECT id FROM chat_rooms WHERE context_key=?').get(context);
  const roomId=old?.id||`room-${randomUUID()}`;
  if(!old) db.prepare('INSERT INTO chat_rooms VALUES (?,?,?,?)').run(roomId,context,JSON.stringify({...room,id:roomId}),new Date().toISOString());
  return {room:withLastMessage(db,getRoom(db,state,actorId,roomId))};
 });
}
function cursor(value) {
 if(value===undefined) return undefined;
 if(!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new ApiError(400,'메시지 위치를 확인해 주세요.','INVALID_CURSOR');
 return Number(value);
}
export function listMessages(db,actorId,roomId,query={}) {
 const after=cursor(query.after),before=cursor(query.before),limit=cursor(query.limit)??100;
 if(after!==undefined && before!==undefined || limit<1 || limit>100) throw new ApiError(400,'조회 범위를 확인해 주세요.','INVALID_CURSOR');
 getRoom(db,readState(db,actorId).state,actorId,roomId);
 let rows;
 if(after!==undefined) rows=db.prepare('SELECT * FROM chat_messages WHERE room_id=? AND id>? ORDER BY id ASC LIMIT ?').all(roomId,after,limit+1);
 else if(before!==undefined) rows=db.prepare('SELECT * FROM chat_messages WHERE room_id=? AND id<? ORDER BY id DESC LIMIT ?').all(roomId,before,limit+1);
 else rows=db.prepare('SELECT * FROM chat_messages WHERE room_id=? ORDER BY id DESC LIMIT ?').all(roomId,limit+1);
 const hasMore=rows.length>limit; rows=rows.slice(0,limit); if(after===undefined) rows.reverse();
 const messages=rows.map(messageRow); return {messages,cursor:messages.at(-1)?.id??after??0,hasMore};
}
export function sendMessage(db,actorId,roomId,input) {
 const p=parse(messageSchema,input); account(p,actorId);
 return transaction(db,()=>{
  getRoom(db,readState(db,actorId).state,actorId,roomId);
  const old=db.prepare('SELECT * FROM chat_messages WHERE sender_id=? AND client_message_id=?').get(actorId,p.clientMessageId);
  if(old) {if(old.room_id!==roomId || old.text!==p.text) throw new ApiError(409,'같은 메시지 번호에 다른 내용을 보낼 수 없습니다.','REQUEST_REUSED'); return {message:messageRow(old)};}
  const made=db.prepare('INSERT INTO chat_messages(room_id,sender_id,client_message_id,text,created_at) VALUES (?,?,?,?,?)').run(roomId,actorId,p.clientMessageId,p.text,new Date().toISOString());
  return {message:messageRow(db.prepare('SELECT * FROM chat_messages WHERE id=?').get(made.lastInsertRowid))};
 });
}
