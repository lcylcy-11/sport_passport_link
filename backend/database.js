import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as d from '../dwnc-app/extended-domain.js';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  return db;
}

export function migrateSports(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const [version,file] of [[1,'001-sports.sql'],[2,'002-collaboration.sql']]) {
  if (db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) continue;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(version,new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}

export function readState(db, actorId = '') {
  const rows = (table) => db.prepare(`SELECT payload FROM ${table}`).all().map(row => JSON.parse(row.payload));
  const meta = db.prepare('SELECT revision, next_id FROM app_meta WHERE id=1').get();
  const state = { version: 2, activeUserId: actorId, nextId: Number(meta.next_id), users: rows('profiles'),
    groups: rows('groups'), matches: rows('matches'), results: rows('results'), appointmentProposals:rows('appointment_proposals'),resultProposals:rows('result_proposals'),
    friendRequests: rows('friend_requests'), invitations: rows('invitations'), notifications: rows('notifications'), dailyNotes: {}, ratings: [] };
  state.notifications.sort((a,b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id, 'en', {numeric:true}));
  state.activeUserId ||= state.users[0]?.id || '';
  for (const group of state.groups) group.memberIds = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(group.id).map(row => row.user_id);
  for (const match of state.matches) match.applications = db.prepare('SELECT payload FROM applications WHERE match_id=?').all(match.id).map(row => JSON.parse(row.payload));
  for (const row of db.prepare('SELECT * FROM daily_notes').all()) {
    state.dailyNotes[row.user_id] ||= {}; state.dailyNotes[row.user_id][row.date] = row.text;
  }
  state.ratings = db.prepare('SELECT match_id AS matchId, from_id AS fromId, to_id AS toId, value FROM ratings').all();
  return { state, revision: Number(meta.revision) };
}

// Called only inside an immediate transaction. Domain rows have explicit owners and
// foreign keys; sport-specific fields stay JSON to preserve the existing rules.
export function writeState(db, state) {
  if (!d.validateV2(state)) throw new Error('Invalid canonical sports state');
  const upsert = (table, keys, columns, values) => {
    const update = columns.filter(col => !keys.includes(col));
    db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT (${keys.join(',')}) ${update.length ? `DO UPDATE SET ${update.map(col => `${col}=excluded.${col}`).join(',')}` : 'DO NOTHING'}`).run(...values);
  };
  const json = JSON.stringify;
  for (const user of state.users) upsert('profiles', ['id'], ['id','friend_code','payload'], [user.id,user.friendCode,json(user)]);
  for (const { memberIds, ...group } of state.groups) {
    upsert('groups', ['id'], ['id','owner_id','payload'], [group.id,group.ownerId,json(group)]);
    for (const id of memberIds) upsert('group_members', ['group_id','user_id'], ['group_id','user_id'], [group.id,id]);
  }
  for (const { applications, ...match } of state.matches) {
    upsert('matches', ['id'], ['id','host_id','group_id','visibility','payload'], [match.id,match.hostId,match.groupId,match.visibility,json(match)]);
    // Withdrawal is the only deletion exposed by the current domain.
    for (const row of db.prepare('SELECT user_id FROM applications WHERE match_id=?').all(match.id)) {
      if (!applications.some(app => app.userId === row.user_id)) db.prepare('DELETE FROM applications WHERE match_id=? AND user_id=?').run(match.id,row.user_id);
    }
    for (const app of applications) upsert('applications', ['match_id','user_id'], ['match_id','user_id','status','payload'], [match.id,app.userId,app.status,json(app)]);
  }
  for (const result of state.results) upsert('results', ['match_id'], ['match_id','recorded_by','payload'], [result.matchId,result.recordedBy,json(result)]);
  for (const p of state.appointmentProposals || []) upsert('appointment_proposals',['id'],['id','room_id','proposed_by','payload'],[p.id,p.roomId,p.proposedBy,json(p)]);
  for (const p of state.resultProposals || []) upsert('result_proposals',['id'],['id','match_id','proposed_by','payload'],[p.id,p.matchId,p.proposedBy,json(p)]);
  for (const req of state.friendRequests) upsert('friend_requests', ['id'], ['id','from_id','to_id','payload'], [req.id,req.fromId,req.toId,json(req)]);
  for (const inv of state.invitations) upsert('invitations', ['id'], ['id','match_id','from_id','to_id','payload'], [inv.id,inv.matchId,inv.fromId,inv.toId,json(inv)]);
  for (const notice of state.notifications) upsert('notifications', ['id'], ['id','user_id','payload'], [notice.id,notice.userId,json(notice)]);
  for (const [id, notes] of Object.entries(state.dailyNotes)) for (const [date,text] of Object.entries(notes)) upsert('daily_notes', ['user_id','date'], ['user_id','date','text'], [id,date,text]);
  for (const r of state.ratings) upsert('ratings', ['match_id','from_id','to_id'], ['match_id','from_id','to_id','value'], [r.matchId,r.fromId,r.toId,r.value]);
  db.prepare('UPDATE app_meta SET revision=revision+1, next_id=? WHERE id=1').run(state.nextId);
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
