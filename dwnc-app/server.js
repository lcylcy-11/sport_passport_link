import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { openDatabase, migrateSports } from '../backend/database.js';
import { createAuth } from '../backend/auth.js';
import { ApiError, ensureProfile, snapshot, executeCommand } from '../backend/commands.js';
import { DomainError } from './domain.js';
import { listRooms,openRoom,listMessages,sendMessage } from '../backend/chat.js';
import { demoSnapshot, executeDemoRecords } from '../backend/demo-controls.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const staticFiles = new Set(['index.html','app.css','app.js','api.js','clock.js','domain.js','extended-domain.js','collaboration-domain.js','chat-view.js','chat.css','workout-share-data.js','icons.js','cards.js','favicon.svg','kong.js','kong-profile.js','kong-profile-view.js','kong-profile.css','passport-view.js','service-model.js','service-glass.css','home-summary.js','home-summary.css']);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const json = (response,status,body) => { response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); response.end(JSON.stringify(body)); };

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new ApiError(415,'JSON 요청만 사용할 수 있습니다.','CONTENT_TYPE');
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 262144) throw new ApiError(413,'요청이 너무 큽니다.','BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400,'요청 형식을 확인해 주세요.','INVALID_JSON'); }
}

export async function createApplication({ databasePath = process.env.DATABASE_PATH || path.join(root,'../data/dwnc.sqlite'), baseURL = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4174', secret, production } = {}) {
  const origin = new URL(baseURL).origin;
  const db = openDatabase(databasePath);
  let auth;
  try { auth = await createAuth(db,origin,{secret,production}); migrateSports(db); }
  catch (error) { db.close(); throw error; }
  const authHandler = toNodeHandler(auth);
  const server = http.createServer(async (request,response) => {
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','same-origin');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(request.url,origin);
      const mutation = !['GET','HEAD'].includes(request.method);
      if (mutation && request.headers.origin !== origin) throw new ApiError(403,'이 사이트에서 보낸 요청만 허용됩니다.','ORIGIN_REJECTED');
      if (url.pathname.startsWith('/api/auth/')) {
        if (!['GET','POST'].includes(request.method)) throw new ApiError(405,'지원하지 않는 요청입니다.','METHOD_NOT_ALLOWED');
        const length = Number(request.headers['content-length'] || 0);
        if (length > 16384 || request.headers['transfer-encoding']) throw new ApiError(413,'인증 요청이 너무 큽니다.','BODY_TOO_LARGE');
        // Trust the socket address only, never a client-supplied forwarded header.
        request.headers['x-dwnc-client-ip'] = request.socket.remoteAddress;
        await authHandler(request,response); return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/health' && request.method === 'GET') { db.prepare('SELECT 1').get(); json(response,200,{ok:true}); return; }
        const session = await auth.api.getSession({headers:fromNodeHeaders(request.headers)});
        if (!session) throw new ApiError(401,'로그인이 필요합니다.','UNAUTHENTICATED');
        ensureProfile(db,session.user);
        if (url.pathname === '/api/state' && request.method === 'GET') { json(response,200,demoSnapshot(db,session.user.id)); return; }
        if (url.pathname === '/api/demo/records' && request.method === 'POST') { json(response,200,executeDemoRecords(db,session.user.id,await readJson(request))); return; }
        if(url.pathname==='/api/chats' && request.method==='GET') {json(response,200,listRooms(db,session.user.id)); return;}
        if(url.pathname==='/api/chats/open' && request.method==='POST') {json(response,200,openRoom(db,session.user.id,await readJson(request))); return;}
        const chatPath=/^\/api\/chats\/([^/]+)\/messages$/.exec(url.pathname);
        if(chatPath && request.method==='GET') {json(response,200,listMessages(db,session.user.id,decodeURIComponent(chatPath[1]),Object.fromEntries(url.searchParams))); return;}
        if(chatPath && request.method==='POST') {json(response,200,sendMessage(db,session.user.id,decodeURIComponent(chatPath[1]),await readJson(request))); return;}
        if (url.pathname === '/api/commands' && request.method === 'POST') {
          const result = executeCommand(db,session.user.id,await readJson(request));
          json(response,200,{...result,...(demoSnapshot(db,session.user.id).demoControls ? {demoControls:true} : {})}); return;
        }
        throw new ApiError(404,'요청한 기능을 찾을 수 없습니다.','NOT_FOUND');
      }
      if (!['GET','HEAD'].includes(request.method)) throw new ApiError(405,'지원하지 않는 요청입니다.','METHOD_NOT_ALLOWED');
      const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!staticFiles.has(filename)) { response.writeHead(404); response.end('Not found'); return; }
      const bytes = await readFile(path.join(root,filename));
      response.writeHead(200,{'Content-Type':types[path.extname(filename)]});
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const status = error instanceof ApiError ? error.status : error instanceof DomainError ? 422 : 500;
      json(response,status,{message:status === 500 ? '서버 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' : error.message,code:error.code || (status === 422 ? 'DOMAIN_RULE' : 'INTERNAL_ERROR')});
      if (status === 500) console.error('DWNC request failed:',error.name);
    }
  });
  server.requestTimeout = 15000;
  return { server,db,auth, async close() { await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve())); db.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4174);
  const app = await createApplication({baseURL:process.env.BETTER_AUTH_URL || `http://127.0.0.1:${port}`});
  app.server.listen(port,'127.0.0.1',() => console.log(`DWNC: http://127.0.0.1:${port}/#/home`));
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; await app.close(); };
  process.once('SIGINT',shutdown); process.once('SIGTERM',shutdown);
}
