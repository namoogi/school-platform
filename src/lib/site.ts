import { createHash } from 'node:crypto';
import { asPublic, type Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 27차: 학교 홈페이지 · 성품 동화 (ADR 0008)
 * 구성원 함수는 asUser 트랜잭션(RLS)에서, 방문자 함수는 asPublic(anon, 공개된 판만)에서 실행한다.
 * 판·공개 기록·그림은 고치지 않고 더하기만 한다(DB 트리거가 막음).
 */
import { LANGS, type Block, type Content, type EntryKind, type EntryStatus, type EntrySummary, type Lang, type LText, type SiteSettings } from './site-shared';
export * from './site-shared';

// ── 내용 검사 ─────────────────────────────────────────────
const VIDEO_HOSTS = ['www.youtube.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com', 'drive.google.com'];

function text(v: unknown, field: string, max = 5000): LText {
  if (v == null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new ValidationError(`${field} 형식이 올바르지 않습니다.`);
  const out: LText = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!LANGS.includes(k as Lang)) throw new ValidationError(`${field}에 지원하지 않는 언어가 있습니다.`);
    if (val == null || val === '') continue;
    if (typeof val !== 'string' || val.length > max) throw new ValidationError(`${field}는 ${max}자 이하 글자여야 합니다.`);
    out[k as Lang] = val;
  }
  return out;
}
function asset(v: unknown, field: string) {
  if (typeof v !== 'string' || !isUuid(v)) throw new ValidationError(`${field}의 그림을 다시 골라 주세요.`);
  return v;
}

export function validateContent(raw: unknown): Content {
  if (!raw || typeof raw !== 'object') throw new ValidationError('내용 형식이 올바르지 않습니다.');
  const r = raw as Record<string, unknown>;
  const title = text(r.title, '제목', 200);
  if (!Object.values(title).some(Boolean)) throw new ValidationError('제목을 한 언어 이상 적어 주세요.');
  const blocksRaw = Array.isArray(r.blocks) ? r.blocks : [];
  if (blocksRaw.length > 200) throw new ValidationError('블록은 200개까지 넣을 수 있습니다.');
  const blocks: Block[] = blocksRaw.map((b, i) => {
    const x = (b ?? {}) as Record<string, unknown>;
    const at = `${i + 1}번째 블록`;
    switch (x.type) {
      case 'heading': return { type: 'heading', text: text(x.text, at, 200) };
      case 'text': return { type: 'text', text: text(x.text, at) };
      case 'notice': return { type: 'notice', text: text(x.text, at, 1000) };
      case 'image': return { type: 'image', asset: asset(x.asset, at), alt: text(x.alt, `${at} 대체 글`, 300), caption: text(x.caption, `${at} 설명`, 500) };
      case 'gallery': {
        const list = Array.isArray(x.assets) ? x.assets : [];
        if (!list.length || list.length > 60) throw new ValidationError(`${at}: 사진은 1~60장이어야 합니다.`);
        return { type: 'gallery', assets: list.map((a) => asset(a, at)), caption: text(x.caption, `${at} 설명`, 500) };
      }
      case 'video': {
        const url = text(x.url, `${at} 주소`, 500);
        for (const u of Object.values(url)) {
          let host = '';
          try { const p = new URL(u!); if (p.protocol !== 'https:') throw new Error(); host = p.hostname; } catch { throw new ValidationError(`${at}: 영상 주소는 https 주소여야 합니다.`); }
          if (!VIDEO_HOSTS.includes(host)) throw new ValidationError(`${at}: 영상은 YouTube·Vimeo·Google Drive 주소만 넣을 수 있습니다.`);
        }
        return { type: 'video', url };
      }
      case 'story_page': return { type: 'story_page', asset: x.asset ? asset(x.asset, at) : undefined, text: text(x.text, at, 2000) };
      default: throw new ValidationError(`${at}: 알 수 없는 블록입니다.`);
    }
  });
  return {
    title, summary: text(r.summary, '요약', 500),
    cover: r.cover ? asset(r.cover, '표지') : undefined, blocks,
  };
}

function validKey(v: unknown) {
  const key = String(v ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(key)) throw new ValidationError('주소 이름은 영문 소문자·숫자·하이픈(-)으로 60자 이하여야 합니다.');
  return key;
}
function kindOf(v: unknown): EntryKind {
  if (v === 'page' || v === 'news' || v === 'story') return v;
  throw new ValidationError('항목 종류가 올바르지 않습니다.');
}
function dbError(e: unknown): never {
  const code = (e as { code?: string }).code;
  if (code === '23505') throw new ValidationError('같은 주소 이름이 이미 있습니다. 다른 이름을 써 주세요.');
  if (code === '42501') throw new ValidationError('이 학교의 라이선스나 권한으로는 할 수 없는 일입니다.');
  throw e;
}

// ── 설정 ─────────────────────────────────────────────────
export async function getSettings(db: Db, schoolId: string): Promise<SiteSettings | null> {
  const { rows } = await db.query<SiteSettings>('select * from public.site_settings where school_id = $1', [schoolId]);
  return rows[0] ?? null;
}

export async function saveSettings(db: Db, schoolId: string, input: Record<string, unknown>) {
  const slug = String(input.public_slug ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) throw new ValidationError('홈페이지 주소 이름은 영문 소문자·숫자·하이픈 2~40자입니다.');
  const langs = (Array.isArray(input.langs) ? input.langs : []).filter((l): l is Lang => LANGS.includes(l as Lang));
  if (!langs.length) throw new ValidationError('언어를 하나 이상 골라 주세요.');
  const def = input.default_lang as Lang;
  if (!langs.includes(def)) throw new ValidationError('기본 언어는 고른 언어 가운데 하나여야 합니다.');
  const theme = input.theme === 'dawn' ? 'dawn' : 'campus';
  const title = text(input.site_title, '사이트 이름', 120);
  const open = input.is_open === true;
  try {
    await db.query(
      `insert into public.site_settings(school_id, public_slug, default_lang, langs, theme, site_title, is_open)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (school_id) do update set public_slug = excluded.public_slug, default_lang = excluded.default_lang, langs = excluded.langs,
         theme = excluded.theme, site_title = excluded.site_title, is_open = excluded.is_open, updated_at = now()`,
      [schoolId, slug, def, langs, theme, JSON.stringify(title), open]);
  } catch (e) { dbError(e); }
  return getSettings(db, schoolId);
}

// ── 항목·판·공개 ─────────────────────────────────────────
export async function listEntries(db: Db, schoolId: string): Promise<EntrySummary[]> {
  const { rows } = await db.query<Omit<EntrySummary, 'status'> & { was_published: boolean }>(
    `select e.id, e.kind, e.key, e.visibility, e.sort, e.meta,
            v.version as latest_version, v.content -> 'title' as latest_title, v.created_at as updated_at,
            lv.version as live_version, p.id is not null as was_published
     from public.site_entries e
     join lateral (select * from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1) v on true
     left join lateral (select * from public.site_publications p where p.entry_id = e.id order by p.id desc limit 1) p on true
     left join public.site_entry_versions lv on lv.id = p.version_id
     where e.school_id = $1
     order by e.kind, e.sort, e.key`, [schoolId]);
  return rows.map(({ was_published, ...r }) => ({
    ...r,
    status: (r.live_version == null ? (was_published ? 'hidden' : 'draft') : r.live_version === r.latest_version ? 'live' : 'changed') as EntryStatus,
  }));
}

export async function getEntry(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('항목을 찾을 수 없습니다.');
  const { rows: [entry] } = await db.query(
    'select id, kind, key, visibility, sort, meta, created_at from public.site_entries where id = $1 and school_id = $2', [id, schoolId]);
  if (!entry) throw new NotFoundError('항목을 찾을 수 없습니다.');
  const { rows: versions } = await db.query<{ id: string; version: number; content: Content; note: string | null; created_at: string }>(
    'select id, version, content, note, created_at from public.site_entry_versions where entry_id = $1 order by version desc', [id]);
  const { rows: pubs } = await db.query<{ id: number; version_id: string | null; published_at: string }>(
    'select id, version_id, published_at from public.site_publications where entry_id = $1 order by id desc', [id]);
  const liveId = pubs[0]?.version_id ?? null;
  return {
    entry: entry as { id: string; kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; sort: number; meta: Record<string, unknown> },
    versions, publications: pubs, liveVersionId: liveId, wasPublished: pubs.length > 0,
  };
}

export async function createEntry(db: Db, schoolId: string, input: Record<string, unknown>) {
  const kind = kindOf(input.kind);
  const key = validKey(input.key);
  const content = validateContent(input.content ?? { title: input.title, blocks: [] });
  const visibility = input.visibility === 'unlisted' ? 'unlisted' : 'public';
  const meta = kind === 'story' ? { virtue: String(input.virtue ?? '').slice(0, 60), character: String(input.character ?? '').slice(0, 60) } : {};
  try {
    const { rows: [e] } = await db.query<{ id: string }>(
      `insert into public.site_entries(school_id, kind, key, visibility, meta) values ($1,$2,$3,$4,$5) returning id`,
      [schoolId, kind, key, visibility, JSON.stringify(meta)]);
    await db.query(
      `insert into public.site_entry_versions(school_id, entry_id, version, content, note) values ($1,$2,1,$3,'처음 만듦')`,
      [schoolId, e.id, JSON.stringify(content)]);
    return { id: e.id };
  } catch (e) { dbError(e); }
}

export async function saveVersion(db: Db, schoolId: string, entryId: string, input: Record<string, unknown>) {
  const { entry } = await getEntry(db, schoolId, entryId);
  const content = validateContent(input.content);
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null;
  try {
    const { rows: [v] } = await db.query<{ id: string; version: number }>(
      `insert into public.site_entry_versions(school_id, entry_id, version, content, note)
       select $1, $2, coalesce(max(version), 0) + 1, $3, $4 from public.site_entry_versions where entry_id = $2
       returning id, version`, [schoolId, entry.id, JSON.stringify(content), note]);
    return v;
  } catch (e) { dbError(e); }
}

export async function updateEntry(db: Db, schoolId: string, entryId: string, input: Record<string, unknown>) {
  const { entry } = await getEntry(db, schoolId, entryId);
  const visibility = input.visibility === 'unlisted' ? 'unlisted' : input.visibility === 'public' ? 'public' : entry.visibility;
  const sort = Number.isInteger(input.sort) ? Number(input.sort) : entry.sort;
  try {
    const r = await db.query('update public.site_entries set visibility = $3, sort = $4 where id = $1 and school_id = $2', [entry.id, schoolId, visibility, sort]);
    if (!r.rowCount) throw Object.assign(new Error('denied'), { code: '42501' });
  } catch (e) { dbError(e); }
  return { ok: true };
}

/** 공개: 고른 판(없으면 최신 판)을 공개 기록에 더한다. versionId=null 이면 공개 내림. 학교 관리자만(RLS). */
export async function publish(db: Db, schoolId: string, entryId: string, versionId: string | null | undefined) {
  const { entry, versions } = await getEntry(db, schoolId, entryId);
  let target: string | null;
  if (versionId === null) target = null;
  else {
    target = versionId ?? versions[0]?.id ?? null;
    if (!target || !versions.some((v) => v.id === target)) throw new ValidationError('공개할 판을 찾을 수 없습니다.');
  }
  try {
    await db.query('insert into public.site_publications(school_id, entry_id, version_id) values ($1,$2,$3)', [schoolId, entry.id, target]);
  } catch (e) { dbError(e); }
  return { ok: true, version_id: target };
}

// ── 그림 ─────────────────────────────────────────────────
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export async function uploadAsset(db: Db, schoolId: string, file: { name: string; type: string; bytes: Buffer }) {
  if (!MIMES.includes(file.type)) throw new ValidationError('PNG·JPG·WEBP·GIF 그림만 올릴 수 있습니다.');
  if (!file.bytes.length || file.bytes.length > 5 * 1024 * 1024) throw new ValidationError('그림은 5MB 이하여야 합니다.');
  const sha = createHash('sha256').update(file.bytes).digest('hex');
  const { rows: [same] } = await db.query<{ id: string }>('select id from public.site_assets where school_id = $1 and sha256 = $2 limit 1', [schoolId, sha]);
  if (same) return { id: same.id, reused: true };
  try {
    const { rows: [a] } = await db.query<{ id: string }>(
      `insert into public.site_assets(school_id, name, mime, size_bytes, sha256, bytes) values ($1,$2,$3,$4,$5,$6) returning id`,
      [schoolId, file.name.slice(0, 200) || 'image', file.type, file.bytes.length, sha, file.bytes]);
    return { id: a.id, reused: false };
  } catch (e) { dbError(e); }
}

export async function listAssets(db: Db, schoolId: string) {
  const { rows } = await db.query<{ id: string; name: string; mime: string; size_bytes: number; created_at: string }>(
    'select id, name, mime, size_bytes, created_at from public.site_assets where school_id = $1 order by created_at desc limit 300', [schoolId]);
  return rows;
}

export async function memberAsset(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) return null;
  const { rows: [a] } = await db.query<{ mime: string; bytes: Buffer; sha256: string }>(
    'select mime, bytes, sha256 from public.site_assets where id = $1 and school_id = $2', [id, schoolId]);
  return a ?? null;
}

// ── 방문자 (공개된 판만) ─────────────────────────────────
export type PublicSite = {
  slug: string; school: string; default_lang: Lang; langs: Lang[]; theme: 'campus' | 'dawn'; title: LText;
  stories: boolean; has_news: boolean; nav: { key: string; title: LText }[];
};
export type PublicEntry = { kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; meta: Record<string, string>; version: number; content: Content; published_at: string };
export type PublicListItem = { key: string; meta: Record<string, string>; title: LText; summary: LText | null; cover: string | null; published_at: string };

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
export async function publicSite(slug: string): Promise<PublicSite | null> {
  if (!SLUG.test(slug)) return null;
  return asPublic(async (db) => (await db.query('select app.public_site($1) as s', [slug])).rows[0].s);
}
export async function publicEntry(slug: string, kind: EntryKind, key: string): Promise<PublicEntry | null> {
  if (!SLUG.test(slug) || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(key)) return null;
  return asPublic(async (db) => (await db.query('select app.public_entry($1,$2,$3) as e', [slug, kind, key])).rows[0].e);
}
export async function publicList(slug: string, kind: EntryKind): Promise<PublicListItem[]> {
  if (!SLUG.test(slug)) return [];
  return asPublic(async (db) => (await db.query('select app.public_list($1,$2) as l', [slug, kind])).rows[0].l ?? []);
}
export async function publicAsset(slug: string, id: string) {
  if (!SLUG.test(slug) || !isUuid(id)) return null;
  return asPublic(async (db) => (await db.query<{ mime: string; bytes: Buffer; sha256: string }>('select * from app.public_asset($1,$2)', [slug, id])).rows[0] ?? null);
}

