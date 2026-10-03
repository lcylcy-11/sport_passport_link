import { openDatabase, migrateSports } from './database.js';
import { ApiError } from './commands.js';

// Only domain data is persisted here. Better Auth accounts/passwords/sessions
// never enter the capsule; identity and sessions belong to Supabase Auth.
export const TABLES = Object.freeze(['app_meta','profiles','groups','group_members','matches','applications','results','friend_requests','invitations','notifications','daily_notes','ratings','command_receipts','chat_rooms','chat_messages','appointment_proposals','result_proposals']);
export const MAX_CAPSULE_BYTES = 20 * 1024 * 1024;
const unavailable = () => new ApiError(503,'저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.','STORE_UNAVAILABLE');

export function exportCapsule(db) {
  const tables = Object.fromEntries(TABLES.map(table => [table,db.prepare(`SELECT * FROM ${table}`).all().map(row => ({...row}))]));
  const capsule = {version:1,tables};
  if (Buffer.byteLength(JSON.stringify(capsule)) > MAX_CAPSULE_BYTES) throw new ApiError(507,'저장 공간이 가득 찼습니다. 관리자에게 문의해 주세요.','STORE_CAPACITY');
  return capsule;
}

export function restoreCapsule(capsule = null) {
  if (capsule !== null && (capsule?.version !== 1 || !capsule.tables || Object.keys(capsule).length !== 2 || Object.keys(capsule.tables).length !== TABLES.length || TABLES.some(table => !Array.isArray(capsule.tables[table])) || Buffer.byteLength(JSON.stringify(capsule)) > MAX_CAPSULE_BYTES)) throw unavailable();
  const db = openDatabase(':memory:');
  try {
    db.exec('CREATE TABLE user (id TEXT PRIMARY KEY)');
    migrateSports(db);
    if (capsule === null) return db;
    db.exec('BEGIN IMMEDIATE');
    db.exec('DELETE FROM app_meta');
    for (const row of capsule.tables.profiles) {
      if (row.auth_user_id) db.prepare('INSERT OR IGNORE INTO user(id) VALUES (?)').run(row.auth_user_id);
    }
    // Dependencies precede children, including rooms before appointment proposals.
    for (const table of TABLES) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
      const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of capsule.tables[table]) {
        if (!row || typeof row !== 'object' || Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row,column))) throw unavailable();
        insert.run(...columns.map(column => row[column]));
      }
    }
    if (db.prepare('SELECT count(*) AS n FROM app_meta').get().n !== 1 || db.prepare('PRAGMA foreign_key_check').all().length) throw unavailable();
    db.exec('COMMIT');
    return db;
  } catch (error) { db.close(); throw error instanceof ApiError ? error : unavailable(); }
}

export function validateSupabaseURL(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('SUPABASE_URL must be an HTTPS origin'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) throw new Error('SUPABASE_URL must be an HTTPS origin');
  return parsed.origin;
}

export class CloudStore {
  constructor({url,serviceKey,fetchImpl=fetch}) {
    this.url=validateSupabaseURL(url);
    if (!serviceKey || typeof serviceKey !== 'string') throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
    this.serviceKey=serviceKey; this.fetchImpl=fetchImpl;
  }
  async rpc(name,payload) {
    let response;
    try {
      response=await this.fetchImpl(`${this.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:this.serviceKey,Authorization:`Bearer ${this.serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw unavailable();
      const text=await response.text();
      if (Buffer.byteLength(text)>MAX_CAPSULE_BYTES+65536) throw unavailable();
      return JSON.parse(text);
    } catch { throw unavailable(); }
  }
  async read() {
    const data=await this.rpc('dwnc_read_store',{});
    if (!Number.isSafeInteger(data?.revision) || data.revision<0 || !Object.hasOwn(data,'capsule')) throw unavailable();
    return data;
  }
  async compareAndSwap(revision,capsule) {
    if (!Number.isSafeInteger(revision) || revision<0 || Buffer.byteLength(JSON.stringify(capsule))>MAX_CAPSULE_BYTES) throw unavailable();
    const result=await this.rpc('dwnc_commit_store',{p_expected_revision:revision,p_capsule:capsule});
    if (!Number.isSafeInteger(result?.revision) || typeof result.committed!=='boolean') throw unavailable();
    if (!result.committed) throw new ApiError(409,'다른 변경이 있습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.','REVISION_CONFLICT');
    return result.revision;
  }
}

// Actions must affect only this disposable DB: a rejected CAS is safe to reapply.
// Domain revision/permission checks still run against each fresh snapshot.
// Never retry transport failures, whose remote outcome may be unknown.
export async function withCloudDatabase(store,action) {
  for (let attempt=0;attempt<3;attempt++) {
    const saved=await store.read();
    const db=restoreCapsule(saved.capsule);
    try {
      const before=JSON.stringify(exportCapsule(db));
      const result=await action(db);
      const after=exportCapsule(db);
      if (JSON.stringify(after)!==before) {
        try { await store.compareAndSwap(saved.revision,after); }
        catch (error) {
          if (error.status===409 && error.code==='REVISION_CONFLICT' && attempt<2) continue;
          throw error;
        }
      }
      return result;
    } finally { db.close(); }
  }
}
