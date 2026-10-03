import { CloudStore, validateSupabaseURL, withCloudDatabase } from '../backend/cloud-store.js';
import { ApiError, ensureProfile, executeCommand } from '../backend/commands.js';
import { listRooms, openRoom, listMessages, sendMessage } from '../backend/chat.js';
import { DomainError } from '../dwnc-app/domain.js';
import { demoUserIds, demoSnapshot, executeDemoRecords } from '../backend/demo-controls.js';

const ACCESS_COOKIE='__Host-dwnc-access';
const REFRESH_COOKIE='__Host-dwnc-refresh';
const securityHeaders={
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};
const unavailable=()=>new ApiError(503,'인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.','AUTH_UNAVAILABLE');
const unauthorized=()=>new ApiError(401,'로그인이 필요합니다.','UNAUTHENTICATED');
const userShape=user=>({id:user.id,email:user.email,name:String(user.user_metadata?.name || user.email?.split('@')[0] || '운동 친구').trim().slice(0,24),emailVerified:!!user.email_confirmed_at});

function cookies(request) {
  const result={};
  for (const part of String(request.headers.cookie || '').split(';')) {
    const i=part.indexOf('=');
    if (i<0) continue;
    const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();
    if (value.length<=8192 && !Object.hasOwn(result,key)) result[key]=value;
  }
  return result;
}
function setSession(response,session) {
  if (!session.access_token || !session.refresh_token || /[\r\n;]/.test(session.access_token+session.refresh_token)) throw unavailable();
  const lifetime=Math.max(60,Math.min(Number(session.expires_in)||3600,86400));
  response.setHeader('Set-Cookie',[
    `${ACCESS_COOKIE}=${session.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`,
    `${REFRESH_COOKIE}=${session.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
  ]);
}
function clearSession(response) { response.setHeader('Set-Cookie',[ACCESS_COOKIE,REFRESH_COOKIE].map(name=>`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)); }

async function readJson(request,max=262144) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new ApiError(415,'JSON 요청만 사용할 수 있습니다.','CONTENT_TYPE');
  if (Number(request.headers['content-length']||0)>max) throw new ApiError(413,'요청이 너무 큽니다.','BODY_TOO_LARGE');
  let text;
  if (request.body!==undefined) text=typeof request.body==='string' ? request.body : JSON.stringify(request.body);
  else {
    const chunks=[]; let size=0;
    for await (const chunk of request) { const bytes=Buffer.from(chunk); size+=bytes.length; if (size>max) throw new ApiError(413,'요청이 너무 큽니다.','BODY_TOO_LARGE'); chunks.push(bytes); }
    text=Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(text)>max) throw new ApiError(413,'요청이 너무 큽니다.','BODY_TOO_LARGE');
  try { return JSON.parse(text); } catch { throw new ApiError(400,'요청 형식을 확인해 주세요.','INVALID_JSON'); }
}

export function createCloudHandler({origin,url,anonKey,serviceKey,fetchImpl=fetch,store,demoIds=demoUserIds()}={}) {
  let parsed;
  try { parsed=new URL(origin); } catch { throw new Error('APP_ORIGIN must be an HTTPS origin'); }
  if (parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['','/'].includes(parsed.pathname)) throw new Error('APP_ORIGIN must be an HTTPS origin');
  origin=parsed.origin; url=validateSupabaseURL(url);
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY is required');
  store ||= new CloudStore({url,serviceKey,fetchImpl});

  async function authFetch(path,{method='GET',token,body}={}) {
    try {
      const response=await fetchImpl(`${url}/auth/v1/${path}`,{method,headers:{apikey:anonKey,...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'} : {})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
      if (response.status>=500) throw unavailable();
      const text=await response.text(); if (Buffer.byteLength(text)>65536) throw unavailable();
      return {status:response.status,ok:response.ok,data:text?JSON.parse(text):{}};
    } catch(error) { throw error instanceof ApiError ? error : unavailable(); }
  }
  async function currentUser(request,response,{optional=false}={}) {
    const jar=cookies(request);
    if (jar[ACCESS_COOKIE]) {
      const verified=await authFetch('user',{token:jar[ACCESS_COOKIE]});
      if (verified.ok && typeof verified.data.id==='string') return userShape(verified.data);
      if (![400,401,403].includes(verified.status)) throw unavailable();
    }
    if (jar[REFRESH_COOKIE]) {
      const refreshed=await authFetch('token?grant_type=refresh_token',{method:'POST',body:{refresh_token:jar[REFRESH_COOKIE]}});
      if (refreshed.ok && refreshed.data.user?.id) {
        // Validate the newly issued token remotely as well; never decode JWTs as proof.
        const verified=await authFetch('user',{token:refreshed.data.access_token});
        if (!verified.ok || !verified.data.id) throw unauthorized();
        setSession(response,refreshed.data); return userShape(verified.data);
      }
      if (![400,401,403].includes(refreshed.status)) throw unavailable();
    }
    clearSession(response);
    if (optional) return null;
    throw unauthorized();
  }
  async function authenticate(path,body,response) {
    if (!body || typeof body!=='object' || Array.isArray(body) || typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || typeof body.password!=='string' || body.password.length>128) throw new ApiError(400,'이메일과 비밀번호를 확인해 주세요.','INVALID_INPUT');
    if (body.password.length<10) throw new ApiError(400,'비밀번호를 10자 이상 입력해 주세요.','PASSWORD_TOO_SHORT');
    const signup=path==='/api/auth/sign-up/email';
    if (signup && (typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>24)) throw new ApiError(400,'이름을 24자 이내로 입력해 주세요.','INVALID_INPUT');
    const result=await authFetch(signup?'signup':'token?grant_type=password',{method:'POST',body:{email:body.email.trim(),password:body.password,...(signup?{data:{name:body.name.trim()}}:{})}});
    if (!result.ok) {
      if (result.status===429) throw new ApiError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.','TOO_MANY_REQUESTS');
      const code=signup && ['user_already_exists','email_exists'].includes(result.data.error_code||result.data.code)?'USER_ALREADY_EXISTS':'INVALID_EMAIL_OR_PASSWORD';
      throw new ApiError(400,signup?'가입 정보를 확인해 주세요.':'이메일 또는 비밀번호를 확인해 주세요.',code);
    }
    if (!result.data.access_token || !result.data.user?.id) throw new ApiError(403,'가입 확인 이메일의 링크를 누른 후 로그인해 주세요.','EMAIL_VERIFICATION_REQUIRED');
    const verified=await authFetch('user',{token:result.data.access_token});
    if (!verified.ok || !verified.data.id) throw unavailable();
    setSession(response,result.data);
    return {user:userShape(verified.data)};
  }

  return async function handler(request,response) {
    for (const [key,value] of Object.entries(securityHeaders)) response.setHeader(key,value);
    const json=(status,data)=>{response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(data));};
    try {
      const route=new URL(request.url,origin),method=request.method;
      if (!['GET','POST'].includes(method)) throw new ApiError(405,'지원하지 않는 요청입니다.','METHOD_NOT_ALLOWED');
      if (method==='POST' && request.headers.origin!==origin) throw new ApiError(403,'이 사이트에서 보낸 요청만 허용됩니다.','ORIGIN_REJECTED');
      if (route.pathname==='/api/health' && method==='GET') {await store.read();json(200,{ok:true,storage:'supabase'});return;}
      if (route.pathname.startsWith('/api/auth/')) {
        if (route.pathname==='/api/auth/get-session' && method==='GET') {const user=await currentUser(request,response,{optional:true});json(200,user?{user,session:{userId:user.id}}:null);return;}
        if (['/api/auth/sign-in/email','/api/auth/sign-up/email'].includes(route.pathname) && method==='POST') {json(200,await authenticate(route.pathname,await readJson(request,16384),response));return;}
        if (route.pathname==='/api/auth/sign-out' && method==='POST') {
          await readJson(request,16384);const access=cookies(request)[ACCESS_COOKIE];clearSession(response);
          if (access) {const result=await authFetch('logout?scope=local',{method:'POST',token:access});if (!result.ok && ![401,403].includes(result.status)) throw unavailable();}
          json(200,{success:true});return;
        }
        throw new ApiError(404,'요청한 기능을 찾을 수 없습니다.','NOT_FOUND');
      }
      const actor=await currentUser(request,response);
      const input=method==='POST'?await readJson(request):undefined;
      const result=await withCloudDatabase(store,db=>{
        db.prepare('INSERT OR IGNORE INTO user(id) VALUES (?)').run(actor.id);
        ensureProfile(db,actor);
        if (route.pathname==='/api/state' && method==='GET') return demoSnapshot(db,actor.id,demoIds);
        if (route.pathname==='/api/demo/records' && method==='POST') return executeDemoRecords(db,actor.id,input,{allowed:demoIds});
        if (route.pathname==='/api/chats' && method==='GET') return listRooms(db,actor.id);
        if (route.pathname==='/api/chats/open' && method==='POST') return openRoom(db,actor.id,input);
        const chatPath=/^\/api\/chats\/([^/]+)\/messages$/.exec(route.pathname);
        if (chatPath && method==='GET') return listMessages(db,actor.id,decodeURIComponent(chatPath[1]),Object.fromEntries(route.searchParams));
        if (chatPath && method==='POST') return sendMessage(db,actor.id,decodeURIComponent(chatPath[1]),input);
        if (route.pathname==='/api/commands' && method==='POST') return {...executeCommand(db,actor.id,input),...(demoIds.has(actor.id)?{demoControls:true}:{})};
        throw new ApiError(404,'요청한 기능을 찾을 수 없습니다.','NOT_FOUND');
      });
      json(200,result);
    } catch(error) {
      const status=error instanceof ApiError?error.status:error instanceof DomainError?422:500;
      json(status,{message:status===500?'서버 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.':error.message,code:error.code||(status===422?'DOMAIN_RULE':'INTERNAL_ERROR')});
    }
  };
}

let configuredHandler;
export default async function handler(request,response) {
  try {
    configuredHandler ||= createCloudHandler({origin:process.env.APP_ORIGIN,url:process.env.SUPABASE_URL,anonKey:process.env.SUPABASE_ANON_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
    await configuredHandler(request,response);
  } catch {
    response.statusCode=503;response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json; charset=utf-8');
    response.end(JSON.stringify({message:'서버 연결 설정이 필요합니다. 관리자에게 문의해 주세요.',code:'CLOUD_NOT_CONFIGURED'}));
  }
}
