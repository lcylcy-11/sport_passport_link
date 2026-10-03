// @ts-check
export class RequestError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] */
  constructor(status,message,code) { super(message); this.status = status; this.code = code; }
}
/** @param {string} pathname @param {unknown} [body] */
export async function request(pathname,body) {
  let response;
  try {
    response = await fetch(pathname,{method:body === undefined ? 'GET' : 'POST',credentials:'same-origin',
      headers:body === undefined ? {} : {'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body),
      signal:AbortSignal.timeout(15000)});
  } catch { throw new RequestError(0,'서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    /** @type {Record<string,string>} */
    const authErrors = { INVALID_EMAIL_OR_PASSWORD:'이메일 또는 비밀번호를 확인해 주세요.', USER_ALREADY_EXISTS:'이미 가입된 이메일입니다. 로그인해 주세요.', USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:'이미 가입된 이메일입니다. 로그인해 주세요.', PASSWORD_TOO_SHORT:'비밀번호를 10자 이상 입력해 주세요.', TOO_MANY_REQUESTS:'요청이 많습니다. 잠시 후 다시 시도해 주세요.' };
    throw new RequestError(response.status,response.status === 429 ? authErrors.TOO_MANY_REQUESTS : authErrors[data.code] || data.message || '요청을 완료하지 못했습니다.',data.code);
  }
  return data;
}
/** @param {string} type @param {unknown} payload @param {number} revision @param {string} expectedUserId */
export async function command(type,payload,revision,expectedUserId) {
  const body = {type,payload,revision,expectedUserId,requestId:crypto.randomUUID()};
  try { return await request('/api/commands',body); }
  catch (error) {
    if (error instanceof RequestError && error.status === 0) return request('/api/commands',body);
    throw error;
  }
}
