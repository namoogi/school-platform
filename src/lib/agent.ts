import type { Db } from './db';
import { checkUpload, fillDownloads, validateContent, type Content } from './site';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 34차: 외부 작업 토큰 (ADR 0012) — 성품 동화 전용, 시안만.
 * 토큰 쪽 함수는 asAgent(agent_request 역할) 안에서 agent.* 명령 함수만 부른다. 토큰 원문은 DB 함수에 넘겨 해시로 확인한다.
 * 관리 쪽 함수는 asUser(학교 관리자) 안에서 부른다.
 */
export const AGENT_TOKEN_RE = /^agt_[0-9a-f]{64}$/;
export const AGENT_DAYS = [7, 30, 90] as const;
export const AGENT_KINDS = { codex: 'Codex', 'claude-code': 'Claude Code', other: '기타' } as const;
export type AgentKind = keyof typeof AGENT_KINDS;
const AGENT_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

const one = async <T>(db: Db, sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0]?.r as T;

export type AgentAsset = { id: string; name: string; mime: string; size_bytes: number; sha256: string; created_at: string };

export const agentWhoami = (db: Db, token: string) => one<Record<string, unknown>>(db, 'select agent.whoami($1) as r', [token]);
export const agentStories = (db: Db, token: string) => one<unknown[]>(db, 'select agent.stories($1) as r', [token]);
export const agentAssets = (db: Db, token: string) => one<AgentAsset[]>(db, 'select agent.assets($1) as r', [token]);

export async function agentStory(db: Db, token: string, key: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(key)) throw new ValidationError('동화 주소 이름이 올바르지 않습니다.');
  return one<{ key: string; meta: Record<string, string>; live_version: number | null; latest: { version: number; content: Content; note: string | null } }>(
    db, 'select agent.story($1, $2) as r', [token, key]);
}

/** 새 판(시안) 저장. 내용은 사람 편집과 같은 검사(validateContent)를 거치고, 내려받기 블록은 이 학교 PDF로 채운다 */
export async function agentSaveStory(db: Db, token: string, key: string, input: Record<string, unknown>) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(key)) throw new ValidationError('동화 주소 이름이 올바르지 않습니다.');
  let content = validateContent(input.content);
  if (content.blocks.some((b) => b.type === 'download')) content = fillDownloads(content, await agentAssets(db, token));
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 240) : '';
  // base_version 이 없거나 틀리면 DB 함수가 범위를 먼저 확인한 뒤 거부한다(범위 밖이면 403이 먼저)
  const n = Number(input.base_version);
  const base = Number.isInteger(n) && n >= 1 ? n : null;
  return one<{ version_id: string; version: number; published: false }>(db, 'select agent.save_story($1, $2, $3, $4, $5) as r',
    [token, key, JSON.stringify(content), note, base]);
}

export async function agentUpload(db: Db, token: string, file: { name: string; type: string; bytes: Buffer }) {
  const mime = checkUpload(file, AGENT_MIMES);
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 200) || 'file';
  return one<{ id: string; reused: boolean }>(db, 'select agent.upload_asset($1, $2, $3, $4) as r', [token, name, mime, file.bytes]);
}

// ── 학교 관리자 ─────────────────────────────────────────
export type AgentTokenRow = {
  id: string; label: string; entry_key: string | null; agent_kind: AgentKind; created_at: string; expires_at: string; revoked_at: string | null;
  last_used_at: string | null; uses: number;
  /** 최근 한 일 3건 (ADR 0013 활동 기록) */
  recent: { action: 'asset.upload' | 'story.version'; created_at: string; detail: Record<string, unknown> }[];
};

export async function listAgentTokens(db: Db, schoolId: string): Promise<AgentTokenRow[]> {
  const { rows } = await db.query<AgentTokenRow>(
    `select t.id, t.label, t.entry_key, t.agent_kind, t.created_at, t.expires_at, t.revoked_at, t.last_used_at,
            (select count(*)::int from public.agent_token_uses u where u.token_id = t.id) as uses,
            coalesce((select jsonb_agg(jsonb_build_object('action', r.action, 'created_at', r.created_at, 'detail', r.detail) order by r.id desc)
                      from (select * from public.agent_token_uses u where u.token_id = t.id order by u.id desc limit 3) r), '[]') as recent
       from public.agent_tokens t where t.school_id = $1 order by t.created_at desc limit 50`, [schoolId]);
  return rows;
}

export async function createAgentToken(db: Db, schoolId: string, input: Record<string, unknown>) {
  const days = Number(input.days ?? 30);
  if (!AGENT_DAYS.includes(days as 7)) throw new ValidationError('기한은 7·30·90일 가운데 고릅니다.');
  const label = String(input.label ?? '').trim().slice(0, 80) || 'Codex 동화 작업';
  const key = typeof input.entry_key === 'string' && input.entry_key.trim() ? input.entry_key.trim().toLowerCase() : null;
  const kind = (typeof input.agent_kind === 'string' && input.agent_kind in AGENT_KINDS ? input.agent_kind : 'codex') as AgentKind;
  const { rows: [r] } = await db.query<{ token: string }>('select app.create_agent_token($1, $2, $3, $4, $5) as token', [schoolId, label, days, key, kind]);
  return { token: r.token };
}

export async function revokeAgentToken(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('토큰을 찾을 수 없습니다.');
  await db.query('select app.revoke_agent_token($1, $2)', [schoolId, id]);
  return { ok: true };
}
