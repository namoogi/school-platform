import { NextResponse } from 'next/server';
import { asAgent, type Db } from './db';
import { errorResponse } from './api';
import { SESSION_COOKIE } from './auth';

/**
 * 39차: 관제 센터 Claude 세션 API (ADR 0015).
 * - 점검 토큰(x-inspector-token, 클라우드 환경이 요청마다 붙임)만 받는다. 로그인 쿠키와 함께 오면 거부한다.
 * - 표 권한이 없는 agent_request 역할로 control.* 함수만 부른다. 토큰 확인은 DB 함수가 한다.
 * - 토큰 원문은 기록·오류 메시지에 남기지 않는다.
 */
export async function handleControl(req: Request, fn: (db: Db, token: string, body: Record<string, unknown>) => Promise<unknown>) {
  const token = req.headers.get('x-inspector-token') ?? '';
  if (!/^insp_[0-9a-f]{64}$/.test(token)) return NextResponse.json({ error: '점검 토큰(x-inspector-token)이 필요합니다.' }, { status: 401 });
  const cookie = req.headers.get('cookie') ?? '';
  if (cookie.split(';').some((c) => c.trim().startsWith(`${SESSION_COOKIE}=`))) {
    return NextResponse.json({ error: '관제 API 요청에는 로그인 쿠키를 함께 보내지 않습니다.' }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  if (req.method !== 'GET') {
    body = await req.json().catch(() => null) as Record<string, unknown>;
    if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식이 올바르지 않습니다(JSON).' }, { status: 400 });
  }
  try {
    const result = await asAgent((db) => fn(db, token, body));
    return NextResponse.json(result ?? { ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if ((e as { code?: string })?.code === '28000') return NextResponse.json({ error: (e as Error).message }, { status: 401 });
    if ((e as { code?: string })?.code === '42883') return NextResponse.json({ error: '관제 API로 할 수 없는 일입니다.' }, { status: 403 });
    return errorResponse(e);
  }
}
