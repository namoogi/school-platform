import type { Db } from './db';
import { checkUpload, fillDownloads, validateContent, type Content } from './site';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 34차: 외부 작업 토큰 (ADR 0012), 36차: 'AI 작업 공간'으로 범위 일반화 (ADR 0013) — 종류(동화·쪽·소식) × 주소 × 권한, 시안만.
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
export const agentAssets = (db: Db, token: string) => one<AgentAsset[]>(db, 'select agent.assets($1) as r', [token]);

/** 36차: 토큰이 맡을 수 있는 항목 종류 · 권한 (ADR 0013 AI 작업 공간) */
export const ENTRY_KINDS = ['story', 'page', 'news'] as const;
export type AgentEntryKind = (typeof ENTRY_KINDS)[number];
export const AGENT_PERMS = { read: '읽기', upload: '파일 올리기', draft: '시안 저장' } as const;
export type AgentPerm = keyof typeof AGENT_PERMS;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
function kindOf(v: string): AgentEntryKind {
  if (!(ENTRY_KINDS as readonly string[]).includes(v)) throw new NotFoundError('항목 종류는 story·page·news 입니다.');
  return v as AgentEntryKind;
}
function keyOf(v: string) {
  if (!KEY_RE.test(v)) throw new ValidationError('주소 이름이 올바르지 않습니다.');
  return v;
}
export type AgentEntry = { kind: AgentEntryKind; key: string; meta: Record<string, string>; live_version: number | null; latest: { version: number; content: Content; note: string | null } };

export const agentEntries = (db: Db, token: string, kind: string) => one<unknown[]>(db, 'select agent.entries($1, $2) as r', [token, kindOf(kind)]);
export const agentEntry = (db: Db, token: string, kind: string, key: string) =>
  one<AgentEntry>(db, 'select agent.entry($1, $2, $3) as r', [token, kindOf(kind), keyOf(key)]);

/** 새 판(시안) 저장. 내용은 사람 편집과 같은 검사(validateContent)를 거치고, 내려받기 블록은 이 학교 PDF로 채운다. 공개는 하지 않는다 */
export async function agentSaveEntry(db: Db, token: string, kind: string, key: string, input: Record<string, unknown>) {
  const k = kindOf(kind);
  keyOf(key);
  let content = validateContent(input.content);
  if (content.blocks.some((b) => b.type === 'download')) content = fillDownloads(content, await agentAssets(db, token));
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 240) : '';
  // base_version 이 없거나 틀리면 DB 함수가 범위를 먼저 확인한 뒤 거부한다(범위 밖이면 403이 먼저)
  const n = Number(input.base_version);
  const base = Number.isInteger(n) && n >= 1 ? n : null;
  return one<{ version_id: string; version: number; published: false }>(db, 'select agent.save_entry($1, $2, $3, $4, $5, $6) as r',
    [token, k, key, JSON.stringify(content), note, base]);
}

// 34차 동화 경로 (같은 결과)
export const agentStories = (db: Db, token: string) => agentEntries(db, token, 'story');
export const agentStory = (db: Db, token: string, key: string) => agentEntry(db, token, 'story', key);
export const agentSaveStory = (db: Db, token: string, key: string, input: Record<string, unknown>) => agentSaveEntry(db, token, 'story', key, input);

export async function agentUpload(db: Db, token: string, file: { name: string; type: string; bytes: Buffer }) {
  const mime = checkUpload(file, AGENT_MIMES);
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 200) || 'file';
  return one<{ id: string; reused: boolean }>(db, 'select agent.upload_asset($1, $2, $3, $4) as r', [token, name, mime, file.bytes]);
}

// ── 학교 관리자 ─────────────────────────────────────────
export type AgentTokenRow = {
  id: string; label: string; kinds: AgentEntryKind[]; keys: string[] | null; perms: AgentPerm[]; agent_kind: AgentKind; created_at: string; expires_at: string; revoked_at: string | null;
  last_used_at: string | null; uses: number;
  /** 최근 한 일 3건 (ADR 0013 활동 기록) */
  recent: { action: string; created_at: string; detail: Record<string, unknown> }[];
};

export async function listAgentTokens(db: Db, schoolId: string): Promise<AgentTokenRow[]> {
  const { rows } = await db.query<AgentTokenRow>(
    `select t.id, t.label, t.kinds, t.keys, t.perms, t.agent_kind, t.created_at, t.expires_at, t.revoked_at, t.last_used_at,
            (select count(*)::int from public.agent_token_uses u where u.token_id = t.id) as uses,
            coalesce((select jsonb_agg(jsonb_build_object('action', r.action, 'created_at', r.created_at, 'detail', r.detail) order by r.id desc)
                      from (select * from public.agent_token_uses u where u.token_id = t.id order by u.id desc limit 3) r), '[]') as recent
       from public.agent_tokens t where t.school_id = $1 order by t.created_at desc limit 50`, [schoolId]);
  return rows;
}

export async function createAgentToken(db: Db, schoolId: string, input: Record<string, unknown>) {
  const days = Number(input.days ?? 30);
  if (!AGENT_DAYS.includes(days as 7)) throw new ValidationError('기한은 7·30·90일 가운데 고릅니다.');
  const label = String(input.label ?? '').trim().slice(0, 80) || '외부 작업';
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  // 34차 입력(entry_key)도 받는다: 동화 하나
  const legacyKey = typeof input.entry_key === 'string' && input.entry_key.trim() ? input.entry_key.trim().toLowerCase() : null;
  const kinds = input.kinds === undefined ? ['story'] : [...new Set(list(input.kinds))];
  const keys = [...new Set(legacyKey ? [legacyKey] : list(input.keys))];
  const perms = input.perms === undefined ? ['read', 'upload', 'draft'] : [...new Set(list(input.perms))];
  if (keys.some((k) => !KEY_RE.test(k))) throw new ValidationError('주소 이름이 올바르지 않습니다.');
  const kind = (typeof input.agent_kind === 'string' && input.agent_kind in AGENT_KINDS ? input.agent_kind : 'codex') as AgentKind;
  const { rows: [r] } = await db.query<{ token: string }>('select app.create_agent_token($1, $2, $3, $4, $5, $6, $7) as token',
    [schoolId, label, days, kinds, keys.length ? keys : null, perms, kind]);
  return { token: r.token };
}

export async function revokeAgentToken(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('토큰을 찾을 수 없습니다.');
  await db.query('select app.revoke_agent_token($1, $2)', [schoolId, id]);
  return { ok: true };
}
