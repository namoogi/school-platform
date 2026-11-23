import { handle, handlePlatform } from './api';
import type { Db } from './db';
import type { ChatScope } from './control';

/**
 * 41차 대화창 API 공통 (ADR 0017). ?scope=platform 이면 전체 관리자 전용(모든 대화),
 * 아니면 지금 학교의 관리자(그 학교 대화만). 학교 ID는 로그인 사용자의 지금 학교에서 정한다.
 */
export function handleChat(req: Request, fn: (db: Db, scope: ChatScope) => Promise<unknown>) {
  const platform = new URL(req.url).searchParams.get('scope') === 'platform';
  if (platform) return handlePlatform(req, ({ db, userId }) => fn(db, { isPlatform: true, schoolId: null, userId }));
  return handle(req, ({ db, school, userId }) => fn(db, { isPlatform: school.isPlatformAdmin, schoolId: school.id, userId }), { admin: true });
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const { ValidationError } = await import('./services');
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') throw new ValidationError('요청 형식이 올바르지 않습니다.');
  return b as Record<string, unknown>;
}
