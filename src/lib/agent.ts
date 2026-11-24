import { createHash } from 'node:crypto';
import { objectKey, objectStore, putVerified } from './storage';
import type { Db } from './db';
import { checkUpload, fillDownloads, validateContent, type Content } from './site';
import { insertBlock, moveBlock, removeBlock, setAt, toggleHidden, type EditPath } from './site-edit';
import type { Block } from './site-shared';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 34차: 외부 작업 토큰 (ADR 0012), 36차: 'AI 작업 공간'으로 범위 일반화 (ADR 0013) — 종류(동화·쪽·소식) × 주소 × 권한, 시안만.
 * 토큰 쪽 함수는 asAgent(agent_request 역할) 안에서 agent.* 명령 함수만 부른다. 토큰 원문은 DB 함수에 넘겨 해시로 확인한다.
 * 관리 쪽 함수는 asUser(학교 관리자) 안에서 부른다.
 */
export const AGENT_TOKEN_RE = /^agt_[0-9a-f]{64}$/;
export const AGENT_DAYS = [7, 30, 90, 365] as const;
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
/** 38차(ADR 0014): 만들기·고치기(내용·구조·항목 정보)·보관. 36차의 draft 는 edit 로 바뀌었다 */
export const AGENT_PERMS = { read: '읽기', upload: '파일 올리기', create: '만들기', edit: '고치기', archive: '보관', publish: '공개', autopublish: '자동 공개' } as const;
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

/** 새 판 저장. 내용은 사람 편집과 같은 검사(validateContent)를 거치고, 내려받기 블록은 이 학교 PDF로 채운다. 공개는 '자동 공개' 토큰일 때만 */
export async function agentSaveEntry(db: Db, token: string, kind: string, key: string, input: Record<string, unknown>) {
  const k = kindOf(kind);
  keyOf(key);
  let content = validateContent(input.content);
  if (content.blocks.some((b) => b.type === 'download' || (b.type === 'gallery' && b.download === 'png'))) content = fillDownloads(content, await agentAssets(db, token));
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 240) : '';
  // base_version 이 없거나 틀리면 DB 함수가 범위를 먼저 확인한 뒤 거부한다(범위 밖이면 403이 먼저)
  const n = Number(input.base_version);
  const base = Number.isInteger(n) && n >= 1 ? n : null;
  const saved = await one<{ version_id: string; version: number; published: boolean }>(db, 'select agent.save_entry($1, $2, $3, $4, $5, $6) as r',
    [token, k, key, JSON.stringify(content), note, base]);
  return autoPublish(db, token, k, key, saved);
}

/**
 * 45차(ADR 0021): '자동 공개' 권한이 있는 토큰은 저장한 그 판을 같은 트랜잭션 안에서 바로 공개한다.
 * 공개가 실패하면(보관한 항목 등) 저장도 함께 되돌린다 — 저장만 되고 공개가 빠지는 일이 없게.
 */
async function autoPublish<T extends { version: number; published: boolean }>(db: Db, token: string, kind: string, key: string, saved: T): Promise<T> {
  const me = await agentWhoami(db, token);
  if (!(Array.isArray(me.perms) && me.perms.includes('autopublish'))) return saved;
  const p = await one<{ version: number; published: true }>(db, 'select agent.publish_entry($1, $2, $3, $4) as r', [token, kind, key, saved.version]);
  return { ...saved, published: true, published_version: p.version, auto_published: true };
}

/** 38차: 새 항목 + 첫 판(시안). create 권한, 주소 목록이 있는 토큰은 그 안에서만, 같은 주소가 있으면 409 */
export async function agentCreateEntry(db: Db, token: string, kind: string, input: Record<string, unknown>) {
  const k = kindOf(kind);
  const key = keyOf(String(input.key ?? '').trim().toLowerCase());
  let content = validateContent(input.content ?? { title: input.title, blocks: [] });
  if (content.blocks.some((b) => b.type === 'download' || (b.type === 'gallery' && b.download === 'png'))) content = fillDownloads(content, await agentAssets(db, token));
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 240) : '';
  const created = await one<{ key: string; version: number; published: boolean }>(db, 'select agent.create_entry($1, $2, $3, $4, $5, $6) as r',
    [token, k, key, JSON.stringify(content), JSON.stringify(input.meta && typeof input.meta === 'object' ? input.meta : {}), note]);
  return autoPublish(db, token, k, key, created);
}

/** 38차: 항목 정보(동화: virtue·character·text_in_image)·순서. edit 권한 */
export async function agentUpdateMeta(db: Db, token: string, kind: string, key: string, input: Record<string, unknown>) {
  const sort = input.sort == null ? null : Number(input.sort);
  if (sort !== null && (!Number.isInteger(sort) || sort < 0 || sort > 9999)) throw new ValidationError('순서는 0~9999 정수입니다.');
  return one<Record<string, unknown>>(db, 'select agent.update_meta($1, $2, $3, $4, $5) as r',
    [token, kindOf(kind), keyOf(key), JSON.stringify(input.meta && typeof input.meta === 'object' ? input.meta : {}), sort]);
}

/** 38차: 보관(소프트 삭제). archive 권한, 공개 중이면 409 */
export const agentArchive = (db: Db, token: string, kind: string, key: string) =>
  one<{ key: string; archived: true }>(db, 'select agent.archive_entry($1, $2, $3) as r', [token, kindOf(kind), keyOf(key)]);

/**
 * 38차: 구조 바꾸기 — 화면 편집(site-edit.ts)과 같은 연산을 최신 판에 차례로 적용해 새 판으로 저장한다.
 * ops: move{from,to} · insert{at,block} · remove{index} · hide{index}(숨기기/보이기 전환) · set{path,value}
 * 결과는 사람 편집과 같은 validateContent 를 거치고, base_version 은 필수다.
 */
export type EditOp =
  | { op: 'move'; from: number; to: number } | { op: 'insert'; at: number; block: Block } | { op: 'remove'; index: number }
  | { op: 'hide'; index: number } | { op: 'set'; path: EditPath; value: unknown };
export async function agentEditOps(db: Db, token: string, kind: string, key: string, input: Record<string, unknown>) {
  const ops = Array.isArray(input.ops) ? (input.ops as EditOp[]) : null;
  if (!ops || !ops.length || ops.length > 100) throw new ValidationError('ops 는 1~100개 연산 배열이어야 합니다.');
  const cur = await agentEntry(db, token, kind, key);
  let c: Content = cur.latest.content;
  const idx = (v: unknown, n: number, at: string) => {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= n) throw new ValidationError(`${at}: 블록 번호가 범위 밖입니다(0~${n - 1}).`);
    return v as number;
  };
  ops.forEach((o, i) => {
    const at = `${i + 1}번째 연산`;
    switch (o?.op) {
      case 'move': c = moveBlock(c, idx(o.from, c.blocks.length, at), idx(o.to, c.blocks.length, at)); break;
      case 'insert': c = insertBlock(c, Number.isInteger(o.at) ? o.at : c.blocks.length, o.block); break;
      case 'remove': c = removeBlock(c, idx(o.index, c.blocks.length, at)); break;
      case 'hide': c = toggleHidden(c, idx(o.index, c.blocks.length, at)); break;
      case 'set': {
        if (!Array.isArray(o.path) || !o.path.length || o.path.some((p) => typeof p !== 'string' && typeof p !== 'number') || ['__proto__', 'constructor', 'prototype'].some((b) => o.path.includes(b))) {
          throw new ValidationError(`${at}: path 가 올바르지 않습니다.`);
        }
        c = setAt(c, o.path, o.value); break;
      }
      default: throw new ValidationError(`${at}: 알 수 없는 연산입니다(move·insert·remove·hide·set).`);
    }
  });
  return agentSaveEntry(db, token, kind, key, { content: c, note: input.note ?? `구조 바꾸기 ${ops.length}건`, base_version: input.base_version });
}

/**
 * 40차(ADR 0016): 공개 · 공개 내림. publish 권한. 사람이 AI에게 공개를 지시했을 때 바로 공개한다.
 * 만들기·고치기는 저절로 공개되지 않는다(이 함수를 따로 불러야 한다). version 이 비면 최신 판.
 */
export async function agentPublish(db: Db, token: string, kind: string, key: string, input: Record<string, unknown>) {
  const v = input.version == null ? null : Number(input.version);
  if (v !== null && (!Number.isInteger(v) || v < 1)) throw new ValidationError('공개할 판 번호가 올바르지 않습니다.');
  return one<{ key: string; version: number; published: true }>(db, 'select agent.publish_entry($1, $2, $3, $4) as r', [token, kindOf(kind), keyOf(key), v]);
}
export const agentUnpublish = (db: Db, token: string, kind: string, key: string) =>
  one<{ key: string; published: false }>(db, 'select agent.unpublish_entry($1, $2, $3) as r', [token, kindOf(kind), keyOf(key)]);

// 34차 동화 경로 (같은 결과)
export const agentStories = (db: Db, token: string) => agentEntries(db, token, 'story');
export const agentStory = (db: Db, token: string, key: string) => agentEntry(db, token, 'story', key);
export const agentSaveStory = (db: Db, token: string, key: string, input: Record<string, unknown>) => agentSaveEntry(db, token, 'story', key, input);

export async function agentUpload(db: Db, token: string, file: { name: string; type: string; bytes: Buffer }) {
  const mime = checkUpload(file, AGENT_MIMES);
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 200) || 'file';
  // 43차(ADR 0018): R2가 있으면 토큰·권한을 먼저 확인하고(실패하면 아무것도 쓰지 않음) R2에 올린 뒤 등록만 한다
  const store = objectStore();
  if (!store) return one<{ id: string; reused: boolean }>(db, 'select agent.upload_asset($1, $2, $3, $4) as r', [token, name, mime, file.bytes]);
  const { school_id } = await one<{ school_id: string }>(db, 'select agent.can_upload($1) as r', [token]);
  const sha = createHash('sha256').update(file.bytes).digest('hex');
  await putVerified(store, objectKey(school_id, sha), file.bytes, mime);
  return one<{ id: string; reused: boolean }>(db, 'select agent.register_asset($1, $2, $3, $4, $5) as r', [token, name, mime, file.bytes.length, sha]);
}

// ── 학교 관리자 ─────────────────────────────────────────
export type AgentTokenRow = {
  id: string; label: string; kinds: AgentEntryKind[]; keys: string[] | null; perms: AgentPerm[]; agent_kind: AgentKind; created_at: string; expires_at: string | null; revoked_at: string | null;
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
  const days = parseDays('days' in input ? input.days : 30);
  const label = String(input.label ?? '').trim().slice(0, 80) || '외부 작업';
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  // 34차 입력(entry_key)도 받는다: 동화 하나
  const legacyKey = typeof input.entry_key === 'string' && input.entry_key.trim() ? input.entry_key.trim().toLowerCase() : null;
  const kinds = input.kinds === undefined ? ['story'] : [...new Set(list(input.kinds))];
  const keys = [...new Set(legacyKey ? [legacyKey] : list(input.keys))];
  // 36차 이름(draft)도 받는다
  const perms = input.perms === undefined ? ['read', 'upload', 'edit'] : [...new Set(list(input.perms).map((p) => (p === 'draft' ? 'edit' : p)))];
  if (keys.some((k) => !KEY_RE.test(k))) throw new ValidationError('주소 이름이 올바르지 않습니다.');
  const kind = (typeof input.agent_kind === 'string' && input.agent_kind in AGENT_KINDS ? input.agent_kind : 'codex') as AgentKind;
  const { rows: [r] } = await db.query<{ token: string }>('select app.create_agent_token($1, $2, $3, $4, $5, $6, $7) as token',
    [schoolId, label, days, kinds, keys.length ? keys : null, perms, kind]);
  return { token: r.token };
}

/** 기한: 7·30·90·365일, 또는 무기한(null·'none'·0) */
function parseDays(v: unknown): number | null {
  if (v === null || v === 'none' || v === 0 || v === '0') return null;
  const d = Number(v);
  if (!AGENT_DAYS.includes(d as 7)) throw new ValidationError('기한은 7·30·90·365일 또는 무기한입니다.');
  return d;
}

/** 38차: 기한 연장(토큰 값 그대로). 남은 기한 끝부터 늘린다. 폐기한 토큰은 안 된다 */
export async function extendAgentToken(db: Db, schoolId: string, id: string, input: Record<string, unknown>) {
  if (!isUuid(id)) throw new NotFoundError('토큰을 찾을 수 없습니다.');
  const { rows: [r] } = await db.query<{ e: string | null }>('select app.extend_agent_token($1, $2, $3) as e', [schoolId, id, parseDays('days' in input ? input.days : 365)]);
  return { expires_at: r.e };
}

/** 38차: 전체 관리자용 모든 학교 토큰 (연례 점검) */
export async function platformAgentTokens(db: Db) {
  const { rows } = await db.query<{ id: string; school_id: string; school_name: string; label: string; kinds: string[]; keys: string[] | null; perms: string[];
    agent_kind: string; created_at: string; expires_at: string | null; revoked_at: string | null; last_used_at: string | null }>('select * from app.platform_agent_tokens()');
  return rows;
}

/** 만료 임박(30일 안) · 오래 안 쓴 무기한(180일) 토큰 */
export function tokenAlerts<T extends { expires_at: string | null; revoked_at: string | null; last_used_at: string | null; created_at: string }>(list: T[], now = Date.now()) {
  const DAY = 86400000;
  const live = list.filter((t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > now));
  return {
    soon: live.filter((t) => t.expires_at && new Date(t.expires_at).getTime() - now <= 30 * DAY),
    stale: live.filter((t) => !t.expires_at && now - new Date(t.last_used_at ?? t.created_at).getTime() >= 180 * DAY),
  };
}

export async function revokeAgentToken(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('토큰을 찾을 수 없습니다.');
  await db.query('select app.revoke_agent_token($1, $2)', [schoolId, id]);
  return { ok: true };
}
