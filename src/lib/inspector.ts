import type { Db } from './db';
import { isUuid, ValidationError } from './services';

/** 30차: Claude 점검 토큰 (전체 관리자 전용). 원문은 발급 때 한 번만 돌려주고 DB에는 해시만 남는다. */
export type InspectorToken = { id: string; label: string; created_at: string; expires_at: string; revoked_at: string | null; last_used_at: string | null };

export async function listInspectorTokens(db: Db): Promise<InspectorToken[]> {
  return (await db.query<InspectorToken>('select * from app.list_inspector_tokens()')).rows;
}

export async function createInspectorToken(db: Db, input: { label?: unknown; days?: unknown }) {
  const label = String(input.label ?? '').trim().slice(0, 80) || 'Claude 세션';
  const days = Number(input.days ?? 30);
  if (![7, 30, 90].includes(days)) throw new ValidationError('err.insp.term');
  const { rows: [r] } = await db.query<{ token: string }>('select app.create_inspector_token($1, $2) as token', [label, days]);
  return { token: r.token };
}

export async function revokeInspectorToken(db: Db, id: string) {
  if (!isUuid(id)) throw new ValidationError('err.tokenNotFound');
  await db.query('select app.revoke_inspector_token($1)', [id]);
  return { ok: true };
}
