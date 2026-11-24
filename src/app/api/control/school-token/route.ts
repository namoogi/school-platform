import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/**
 * 51차(ADR 0024): 관제 세션의 학교 작업 권한 — 학교 작업 토큰 발급.
 * body: { slug, kinds: ['page','news'], perms: ['read','upload','edit','publish'], days?: 1~30(기본 7), label? }
 * 돌려준 토큰 원문은 기록·커밋·대화에 남기지 않는다. 쓰기는 /api/agent/* 로(x-agent-token).
 */
export async function POST(req: Request) {
  return handleControl(req, (db, t, body) => control.schoolToken(db, t, body));
}
