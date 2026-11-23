import { NextResponse } from 'next/server';
import { asAgent, type Db } from './db';
import { errorResponse } from './api';
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
  if (!AGENT_TOKEN_RE.test(token)) return NextResponse.json({ error: '작업 토큰(x-agent-token)이 필요합니다.' }, { status: 401 });
  const cookie = req.headers.get('cookie') ?? '';
  if (cookie.split(';').some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`))) {
    return NextResponse.json({ error: '작업 토큰 요청에는 로그인 쿠키를 함께 보내지 않습니다.' }, { status: 400 });
  }
  try {
    const result = await asAgent((db) => fn(db, token));
    return NextResponse.json(result ?? { ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if ((e as { code?: string })?.code === '28000') return NextResponse.json({ error: (e as Error).message }, { status: 401 });
    // 함수가 없거나 권한 밖(공개·설정 등)인 호출
    if ((e as { code?: string })?.code === '42883') return NextResponse.json({ error: '작업 토큰으로 할 수 없는 일입니다.' }, { status: 403 });
    return errorResponse(e);
  }
}
