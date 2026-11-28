import { NextResponse } from 'next/server';
import { asAgent, type Db } from './db';
import { errorResponse, fail } from './api';
import { AGENT_TOKEN_RE } from './agent';
import { SESSION_COOKIE } from './auth';

/**
 * 34차: 외부 작업 토큰 API 공통 처리 (ADR 0012).
 * - 토큰은 요청 머리 x-agent-token 에서만 읽는다. 로그인 쿠키와 함께 오면 거부한다(두 신원이 섞이지 않게).
 * - 브라우저가 다른 출처에서 이 머리를 붙이려면 CORS 사전 요청이 필요한데 허용하지 않으므로 CSRF 경로가 없다.
 * - asAgent(agent_request 역할) 트랜잭션 안에서 agent.* 함수만 부른다. 토큰 확인·범위 판단은 DB 함수가 한다.
 * - 토큰 원문은 기록·오류 메시지에 남기지 않는다.
 */
export async function handleAgent(req: Request, fn: (db: Db, token: string) => Promise<unknown>) {
  const token = req.headers.get('x-agent-token') ?? '';
  if (!AGENT_TOKEN_RE.test(token)) return fail(401, 'err.agentTokenRequired');
  const cookie = req.headers.get('cookie') ?? '';
  if (cookie.split(';').some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`))) {
    return fail(400, 'err.agentNoCookie');
  }
  try {
    const result = await asAgent((db) => fn(db, token), { session: agentHeader(req, 'x-agent-session', 80), operator: agentHeader(req, 'x-agent-operator', 120) });
    return NextResponse.json(result ?? { ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if ((e as { code?: string })?.code === '28000') return NextResponse.json({ error: (e as Error).message }, { status: 401 });
    // 함수가 없거나 권한 밖(공개·설정 등)인 호출
    if ((e as { code?: string })?.code === '42883') return fail(403, 'err.agentNotAllowed');
    return errorResponse(e);
  }
}

/**
 * 83차: 세션 이름·작업자(이름이나 이메일) 머리. HTTP 머리는 영문만 안전해서 한글은 URL 인코딩(encodeURIComponent)해 보낸다.
 * 인코딩된 값이면 풀고, 아니면 그대로. 제어 문자는 지우고 길이를 자른다. 검증되지 않은 자기 신고 값이다.
 */
export function agentHeader(req: Request, name: string, max: number): string | null {
  const raw = req.headers.get(name);
  if (!raw) return null;
  let v = raw;
  if (/%[0-9a-f]{2}/i.test(raw)) { try { v = decodeURIComponent(raw); } catch { v = raw; } }
  v = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return v || null;
}
