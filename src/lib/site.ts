import { objectKey, objectStore, putVerified } from './storage';
import { createHash } from 'node:crypto';
import { asPublic, type Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';
import { checkPdf, sniffMime } from './pdf-check';
import { photoAssetIds } from './site-photos';

/**
 * 27차: 학교 홈페이지 · 성품 동화 (ADR 0008)
 * 구성원 함수는 asUser 트랜잭션(RLS)에서, 방문자 함수는 asPublic(anon, 공개된 판만)에서 실행한다.
 * 판·공개 기록·그림은 고치지 않고 더하기만 한다(DB 트리거가 막음).
 */
import {
  LANGS, SECTION_TEMPLATES, SECTION_VARIANTS, type SectionVariant, type Block, type Button, type Content, type EntryKind, type EntryStatus, type EntrySummary, type GalleryFilter,
  type GalleryItem, type Lang, type LanguageImages, type LText, type NavEntry, type SectionItem, type SectionTemplate, type SiteProfile, type SiteSettings, type SiteTheme, isSiteTheme, RESERVED_ANCHORS, ANCHOR_BLOCKS, anchorTitle,
} from './site-shared';
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
/** UUID를 번역 글로 오인하지 않도록 { 언어: { asset } } 형태를 쓴다. */
function languageImages(raw: unknown, field: string): LanguageImages | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError(`${field}: 언어별 그림 형식이 올바르지 않습니다.`);
  const out: LanguageImages = {};
  for (const [lang, image] of Object.entries(raw)) {
    if (!LANGS.includes(lang as Lang) || !image || typeof image !== 'object' || Array.isArray(image)) {
      throw new ValidationError(`${field}: 언어별 그림 형식이 올바르지 않습니다.`);
    }
    out[lang as Lang] = { asset: asset((image as Record<string, unknown>).asset, field) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** 링크: 사이트 안 경로(/p/about, /news, /stories/x, 끝의 #구역 허용) 또는 https 주소 */
function href(v: unknown, field: string): string {
  const s = String(v ?? '').trim();
  if (/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?(?:#[a-z0-9-]+)?$/.test(s)) return s;
  try { const u = new URL(s); if (u.protocol === 'https:' && s.length <= 500) return u.toString(); } catch { /* 아래에서 거부 */ }
  throw new ValidationError(`${field}: 링크는 사이트 안 경로(/p/…)나 https 주소여야 합니다.`);
}
function button(v: unknown, field: string): Button | undefined {
  if (v == null) return undefined;
  const x = v as Record<string, unknown>;
  return { label: text(x.label, `${field} 단추 이름`, 80), href: href(x.href, `${field} 단추`) };
}
function opt<T>(v: T | undefined, empty: (t: T) => boolean): T | undefined { return v === undefined || empty(v) ? undefined : v; }
const noText = (t: LText) => !Object.values(t).some(Boolean);

function sectionBlock(x: Record<string, unknown>, at: string): Block {
  const template = x.template as SectionTemplate;
  if (!SECTION_TEMPLATES.includes(template)) throw new ValidationError(`${at}: 구역 모양이 올바르지 않습니다.`);
  const itemsRaw = x.items == null ? [] : Array.isArray(x.items) ? x.items : null;
  if (!itemsRaw || itemsRaw.length > 12) throw new ValidationError(`${at}: 항목은 12개까지 넣을 수 있습니다.`);
  const items: SectionItem[] = itemsRaw.map((it, j) => {
    const y = (it ?? {}) as Record<string, unknown>;
    const f = `${at} ${j + 1}번째 항목`;
    return {
      title: opt(text(y.title, f, 200), noText), body: opt(text(y.body, f, 3000), noText),
      asset: y.asset ? asset(y.asset, f) : undefined, alt: opt(text(y.alt, `${f} 대체 글`, 300), noText),
      href: y.href ? href(y.href, f) : undefined, tag: opt(text(y.tag, `${f} 분류`, 40), noText),
    };
  });
  const variant = x.variant == null || x.variant === '' ? undefined : (x.variant as SectionVariant);
  if (variant !== undefined && !SECTION_VARIANTS.includes(variant)) throw new ValidationError(`${at}: 구역 배치 이름이 올바르지 않습니다.`);
  return {
    type: 'section', template, variant,
    eyebrow: opt(text(x.eyebrow, `${at} 머리말`, 120), noText), title: opt(text(x.title, `${at} 제목`, 200), noText),
    body: opt(text(x.body, at), noText), asset: x.asset ? asset(x.asset, at) : undefined,
    alt: opt(text(x.alt, `${at} 대체 글`, 300), noText), caption: opt(text(x.caption, `${at} 사진 설명`, 300), noText),
    items: items.length ? items : undefined, button: button(x.button, at),
  };
}

function galleryBlock(x: Record<string, unknown>, at: string): Block {
  const itemsRaw = Array.isArray(x.items) ? x.items : null;
  const filtersRaw = Array.isArray(x.filters) ? x.filters : [];
  const items: GalleryItem[] | undefined = itemsRaw?.map((it, j) => {
    const y = (it ?? {}) as Record<string, unknown>;
    const cat = y.category == null || y.category === '' ? undefined : String(y.category);
    if (cat !== undefined && !/^[a-z0-9-]{1,30}$/.test(cat)) throw new ValidationError(`${at} ${j + 1}번째 사진: 묶음 이름이 올바르지 않습니다.`);
    return { asset: asset(y.asset, at), alt: opt(text(y.alt, `${at} 대체 글`, 300), noText), category: cat };
  });
  const assets = items ? items.map((i) => i.asset) : (Array.isArray(x.assets) ? x.assets : []).map((a) => asset(a, at));
  if (!assets.length || assets.length > 60) throw new ValidationError(`${at}: 사진은 1~60장이어야 합니다.`);
  if (filtersRaw.length > 8) throw new ValidationError(`${at}: 묶음 거르기는 8개까지입니다.`);
  const filters: GalleryFilter[] = filtersRaw.map((f) => {
    const y = (f ?? {}) as Record<string, unknown>;
    const key = String(y.key ?? '');
    if (!/^[a-z0-9-]{1,30}$/.test(key)) throw new ValidationError(`${at}: 묶음 이름이 올바르지 않습니다.`);
    return { key, label: text(y.label, `${at} 묶음`, 60) };
  });
  if (x.download != null && x.download !== 'png') throw new ValidationError(`${at}: 캐릭터 내려받기는 PNG만 지원합니다.`);
  const scene = x.scene == null ? undefined : x.scene;
  if (scene !== undefined && (x.download !== 'png' || typeof scene !== 'number' || !Number.isInteger(scene) || scene < 1 || scene > 200)) throw new ValidationError(`${at}: 장면 번호는 1~200 사이 정수여야 합니다.`);
  return { type: 'gallery', download: x.download === 'png' ? 'png' : undefined, scene: scene as number | undefined, assets, caption: text(x.caption, `${at} 설명`, 500), items, filters: filters.length ? filters : undefined };
}

function siteProfile(v: unknown): SiteProfile | undefined {
  if (v == null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new ValidationError('사이트 정보 형식이 올바르지 않습니다.');
  const x = v as Record<string, unknown>;
  const phone = x.phone == null ? [] : Array.isArray(x.phone) ? x.phone : null;
  if (!phone || phone.length > 3 || phone.some((p) => typeof p !== 'string' || !/^[0-9+()\- ]{3,30}$/.test(p))) {
    throw new ValidationError('전화번호는 숫자·+·-·괄호로 3개까지 적어 주세요.');
  }
  return {
    logo: x.logo ? asset(x.logo, '로고') : undefined,
    tagline: opt(text(x.tagline, '학교 소개 한 줄', 200), noText), address: opt(text(x.address, '주소', 300), noText),
    phone: phone.length ? (phone as string[]) : undefined, facebook: x.facebook ? href(x.facebook, '페이스북') : undefined,
    footer: opt(text(x.footer, '바닥 글', 500), noText), visit: button(x.visit, '방문 안내'),
  };
}

/** 블록 한 개 검사 (hidden 표시는 validateContent 가 붙인다) */
function blockOf(x: Record<string, unknown>, at: string): Block {
  switch (x.type) {
    case 'heading': return { type: 'heading', text: text(x.text, at, 200) };
    case 'text': return { type: 'text', text: text(x.text, at) };
    case 'notice': return { type: 'notice', text: text(x.text, at, 1000) };
    case 'image': return { type: 'image', asset: asset(x.asset, at), images: languageImages(x.images, at), alt: text(x.alt, `${at} 대체 글`, 300), caption: text(x.caption, `${at} 설명`, 500) };
    case 'gallery': return galleryBlock(x, at);
    case 'section': return sectionBlock(x, at);
    case 'news_list': {
      const count = Number(x.count ?? 3);
      if (!Number.isInteger(count) || count < 1 || count > 10) throw new ValidationError(`${at}: 소식 개수는 1~10개입니다.`);
      return { type: 'news_list', eyebrow: opt(text(x.eyebrow, `${at} 머리말`, 120), noText), title: opt(text(x.title, `${at} 제목`, 200), noText), body: opt(text(x.body, at, 1000), noText), count, style: x.style === 'list' ? 'list' : 'cards' };
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
    case 'subpages': return { type: 'subpages' };
    case 'inquiry': return { type: 'inquiry', title: opt(text(x.title, `${at} 제목`, 200), noText), body: opt(text(x.body, `${at} 안내`, 1000), noText) };
    case 'download': return {
      type: 'download', asset: asset(x.asset, at), label: opt(text(x.label, `${at} 이름`, 120), noText), note: opt(text(x.note, `${at} 설명`, 300), noText),
    };
    case 'story_page': return { type: 'story_page', images: languageImages(x.images, at), asset: x.asset ? asset(x.asset, at) : undefined, text: text(x.text, at, 2000) };
    default: throw new ValidationError(`${at}: 알 수 없는 블록입니다.`);
  }
}

export function validateContent(raw: unknown): Content {
  if (!raw || typeof raw !== 'object') throw new ValidationError('내용 형식이 올바르지 않습니다.');
  const r = raw as Record<string, unknown>;
  const title = text(r.title, '제목', 200);
  if (!Object.values(title).some(Boolean)) throw new ValidationError('제목을 한 언어 이상 적어 주세요.');
  const blocksRaw = Array.isArray(r.blocks) ? r.blocks : [];
  if (blocksRaw.length > 200) throw new ValidationError('블록은 200개까지 넣을 수 있습니다.');
  const anchors = new Set<string>();
  const blocks: Block[] = blocksRaw.map((b, i) => {
    const x = (b ?? {}) as Record<string, unknown>;
    const out: Block = blockOf(x, `${i + 1}번째 블록`);
    if (x.hidden === true) out.hidden = true;
    // 126차(ADR 0046): 메뉴 주소 — 이 쪽 안에서 하나뿐, 영문 소문자·숫자·하이픈
    const anchor = typeof x.anchor === 'string' ? x.anchor.trim().toLowerCase() : '';
    if (anchor) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(anchor) || RESERVED_ANCHORS.includes(anchor)) throw new ValidationError('err.site.anchorFormat', { n: i + 1 });
      if (!(ANCHOR_BLOCKS as readonly string[]).includes(out.type) || !Object.values(anchorTitle(out) ?? {}).some(Boolean)) throw new ValidationError('err.site.anchorTitle', { n: i + 1 });
      if (anchors.has(anchor)) throw new ValidationError('err.site.anchorDuplicate', { anchor });
      anchors.add(anchor); out.anchor = anchor;
    }
    return out;
  });
  const menuRaw = (r.menu ?? null) as Record<string, unknown> | null;
  const parent = menuRaw && typeof menuRaw.parent === 'string' ? menuRaw.parent.trim().toLowerCase() : '';
  if (parent && (parent === 'home' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(parent))) throw new ValidationError('err.site.menuParent');
  const headRaw = (r.head ?? null) as Record<string, unknown> | null;
  const head = headRaw ? {
    eyebrow: opt(text(headRaw.eyebrow, '머리말', 120), noText),
    layout: headRaw.layout === 'opening' ? 'opening' as const : headRaw.layout === 'editorial' ? 'editorial' as const : undefined,
    link: button(headRaw.link, '쪽 머리 링크'), note: opt(text(headRaw.note, '표지 사진 날짜', 120), noText),
  } : undefined;
  return {
    title, summary: text(r.summary, '요약', 1000),
    cover: r.cover ? asset(r.cover, '표지') : undefined, blocks,
    site: siteProfile(r.site), head: head && (head.eyebrow || head.layout || head.link || head.note) ? head : undefined,
    ...(parent ? { menu: { parent } } : {}),
  };
}

/**
 * 34차: 내려받기 블록의 파일 이름·크기를 그 학교 자산에서 채운다. PDF/캐릭터 PNG 형식이 아니거나 다른 학교 파일이면 거부.
 * assets 는 이 학교 자산 목록(사람 경로: RLS, 토큰 경로: agent.assets)
 */
export function fillDownloads(content: Content, assets: { id: string; name: string; mime: string; size_bytes: number }[]): Content {
  const by = new Map(assets.map((a) => [a.id, a]));
  for (const id of languageImageIds(content)) {
    const image = by.get(id);
    if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mime)) {
      throw new ValidationError('언어별 그림에는 이 학교에 올린 PNG·JPG·WEBP를 골라 주세요.');
    }
  }
  return {
    ...content,
    blocks: content.blocks.map((b, i) => {
      if (b.type === 'gallery' && b.download === 'png') {
        const items = (b.items ?? b.assets.map((id) => ({ asset: id }))).map((item) => {
          const a = by.get(item.asset);
          if (!a || a.mime !== 'image/png') throw new ValidationError(`${i + 1}번째 블록: 캐릭터 내려받기에는 이 학교에 올린 PNG를 골라 주세요.`);
          return { ...item, file_name: a.name, size_bytes: a.size_bytes };
        });
        return { ...b, items, assets: items.map((item) => item.asset) };
      }
      if (b.type !== 'download') return b;
      const a = by.get(b.asset);
      if (!a || a.mime !== 'application/pdf') throw new ValidationError(`${i + 1}번째 블록: 내려받기에는 이 학교에 올린 PDF를 골라 주세요.`);
      return { ...b, file_name: a.name, size_bytes: a.size_bytes };
    }),
  };
}
export function languageImageIds(content: Content): string[] {
  return content.blocks.flatMap((b) => b.type === 'image' || b.type === 'story_page' ? Object.values(b.images ?? {}).map((image) => image.asset) : []);
}
async function withDownloads(db: Db, schoolId: string, content: Content) {
  const ids = [...languageImageIds(content), ...content.blocks.flatMap((b) => (b.type === 'download' ? [b.asset] : b.type === 'gallery' && b.download === 'png' ? b.assets : []))];
  if (!ids.length) return content;
  const { rows } = await db.query<{ id: string; name: string; mime: string; size_bytes: number }>(
    'select id, name, mime, size_bytes from public.site_assets where school_id = $1 and id = any($2::uuid[])', [schoolId, ids]);
  return fillDownloads(content, rows);
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
  const theme = isSiteTheme(input.theme) ? input.theme : 'campus';
  const title = text(input.site_title, '사이트 이름', 120);
  const open = input.is_open === true;
  const inquiry = input.inquiry_open === true; // 91차: 방문·상담 신청 받기
  try {
    await db.query(
      `insert into public.site_settings(school_id, public_slug, default_lang, langs, theme, site_title, is_open, inquiry_open)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (school_id) do update set public_slug = excluded.public_slug, default_lang = excluded.default_lang, langs = excluded.langs,
         theme = excluded.theme, site_title = excluded.site_title, is_open = excluded.is_open, inquiry_open = excluded.inquiry_open, updated_at = now()`,
      [schoolId, slug, def, langs, theme, JSON.stringify(title), open, inquiry]);
  } catch (e) { dbError(e); }
  return getSettings(db, schoolId);
}

// ── 항목·판·공개 ─────────────────────────────────────────
export async function listEntries(db: Db, schoolId: string): Promise<EntrySummary[]> {
  const { rows } = await db.query<Omit<EntrySummary, 'status'> & { was_published: boolean }>(
    `select e.id, e.kind, e.key, e.visibility, e.sort, e.meta, e.archived_at,
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
    'select id, kind, key, visibility, sort, meta, created_at, archived_at from public.site_entries where id = $1 and school_id = $2', [id, schoolId]);
  if (!entry) throw new NotFoundError('항목을 찾을 수 없습니다.');
  const { rows: versions } = await db.query<{ id: string; version: number; content: Content; note: string | null; created_at: string }>(
    'select id, version, content, note, created_at from public.site_entry_versions where entry_id = $1 order by version desc', [id]);
  const { rows: pubs } = await db.query<{ id: number; version_id: string | null; published_at: string }>(
    'select id, version_id, published_at from public.site_publications where entry_id = $1 order by id desc', [id]);
  const liveId = pubs[0]?.version_id ?? null;
  return {
    entry: entry as { id: string; kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; sort: number; meta: Record<string, unknown>; archived_at: string | null },
    versions, publications: pubs, liveVersionId: liveId, wasPublished: pubs.length > 0,
  };
}

export async function createEntry(db: Db, schoolId: string, input: Record<string, unknown>) {
  const kind = kindOf(input.kind);
  const key = validKey(input.key);
  const content = await withDownloads(db, schoolId, validateContent(input.content ?? { title: input.title, blocks: [] }));
  const visibility = input.visibility === 'unlisted' ? 'unlisted' : 'public';
  const meta = kind === 'story'
    ? { virtue: String(input.virtue ?? '').slice(0, 60), character: String(input.character ?? '').slice(0, 120), ...(input.text_in_image === true ? { text_in_image: 'true' } : {}) }
    : {};
  const sort = Number.isInteger(input.sort) && Number(input.sort) >= 0 && Number(input.sort) <= 9999 ? Number(input.sort) : 0;
  try {
    const { rows: [e] } = await db.query<{ id: string }>(
      `insert into public.site_entries(school_id, kind, key, visibility, meta, sort) values ($1,$2,$3,$4,$5,$6) returning id`,
      [schoolId, kind, key, visibility, JSON.stringify(meta), sort]);
    await db.query(
      `insert into public.site_entry_versions(school_id, entry_id, version, content, note) values ($1,$2,1,$3,$4)`,
      [schoolId, e.id, JSON.stringify(content), typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : '처음 만듦']);
    return { id: e.id };
  } catch (e) { dbError(e); }
}

export async function saveVersion(db: Db, schoolId: string, entryId: string, input: Record<string, unknown>) {
  const { entry, versions } = await getEntry(db, schoolId, entryId);
  // ADR 0013 병행 규칙: 보고 고친 판(base_version)을 보내면, 그 사이 새 판이 생겼을 때 덮지 않고 409로 알린다
  if (input.base_version != null && Number(input.base_version) !== versions[0]?.version) {
    throw Object.assign(new Error(`그 사이 새 판(${versions[0]?.version}판)이 생겼습니다. 새로 고친 뒤 다시 저장해 주세요.`), { code: 'P0001' });
  }
  const content = await withDownloads(db, schoolId, validateContent(input.content));
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
  // 32차: 동화의 성품 이름·주인공은 만든 뒤에도 고칠 수 있다(가져온 동화는 성품 이름이 비어 있음). 다른 표시(text_in_image)는 그대로 둔다.
  const meta = { ...(entry.meta as Record<string, unknown>) };
  if (entry.kind === 'story') {
    if (typeof input.virtue === 'string') meta.virtue = input.virtue.trim().slice(0, 60);
    if (typeof input.character === 'string') meta.character = input.character.trim().slice(0, 120);
  }
  try {
    const r = await db.query('update public.site_entries set visibility = $3, sort = $4, meta = $5 where id = $1 and school_id = $2', [entry.id, schoolId, visibility, sort, JSON.stringify(meta)]);
    if (!r.rowCount) throw Object.assign(new Error('denied'), { code: '42501' });
  } catch (e) { dbError(e); }
  return { ok: true };
}

/** 122차: 판 안의 사진(이 학교 그림 자산만, PDF 제외). 공개 창의 사진 공개 허가 확인에 쓴다 */
export async function photosOf(db: Db, schoolId: string, content: Content | null | undefined): Promise<{ id: string; name: string }[]> {
  const ids = photoAssetIds(content).filter(isUuid);
  if (!ids.length) return [];
  const { rows } = await db.query<{ id: string; name: string }>(
    `select id, name from public.site_assets where school_id = $1 and id = any($2::uuid[]) and mime like 'image/%'`, [schoolId, ids]);
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (by.has(id) ? [by.get(id)!] : []));
}

/** 122차: 공개하려는 판들의 사진 목록 (공개 창이 보여 준다). targets: [{ entryId, versionId? }] — versionId 가 없으면 최신 판 */
export async function publishPhotos(db: Db, schoolId: string, raw: unknown) {
  const targets = (raw as { targets?: unknown } | null)?.targets;
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 100) throw new ValidationError('err.photoTargets');
  const entries: { entryId: string; version: number; photos: { id: string; name: string }[] }[] = [];
  for (const t of targets as { entryId?: unknown; versionId?: unknown }[]) {
    const { entry, versions } = await getEntry(db, schoolId, String(t?.entryId ?? ''));
    const v = typeof t?.versionId === 'string' ? versions.find((x) => x.id === t.versionId) : versions[0];
    if (!v) throw new ValidationError('공개할 판을 찾을 수 없습니다.');
    entries.push({ entryId: entry.id, version: v.version, photos: await photosOf(db, schoolId, v.content) });
  }
  const seen = new Set<string>();
  const photos = entries.flatMap((e) => e.photos).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  return { entries, photos };
}

/**
 * 공개: 고른 판(없으면 최신 판)을 공개 기록에 더한다. versionId=null 이면 공개 내림. 학교 관리자만(RLS).
 * 122차: 사진이 든 판은 공개 창에서 사진 공개 허가를 확인해야 공개된다(photoConsent). 확인 시각·사진 목록을 공개 기록에 남긴다.
 */
export async function publish(db: Db, schoolId: string, entryId: string, versionId: string | null | undefined, opts: { photoConsent?: boolean } = {}) {
  const { entry, versions } = await getEntry(db, schoolId, entryId);
  if (entry.archived_at && versionId !== null) throw new ValidationError('보관한 항목은 공개할 수 없습니다. 먼저 되살려 주세요.');
  let target: string | null;
  if (versionId === null) target = null;
  else {
    target = versionId ?? versions[0]?.id ?? null;
    if (!target || !versions.some((v) => v.id === target)) throw new ValidationError('공개할 판을 찾을 수 없습니다.');
  }
  const photos = target ? await photosOf(db, schoolId, versions.find((v) => v.id === target)?.content) : [];
  if (photos.length && opts.photoConsent !== true) throw new ValidationError('err.photoConsentRequired', { n: photos.length });
  try {
    await db.query(
      `insert into public.site_publications(school_id, entry_id, version_id, photo_consent_at, photo_consent_assets)
       values ($1,$2,$3, case when $4::uuid[] is null then null else now() end, $4::uuid[])`,
      [schoolId, entry.id, target, photos.length ? photos.map((p) => p.id) : null]);
  } catch (e) { dbError(e); }
  return { ok: true, version_id: target, photos: photos.length };
}

/**
 * 38차(ADR 0014): 보관(소프트 삭제)·되살리기. 학교 관리자만(RLS site_entries_update).
 * 판·공개 기록·그림은 그대로 남는다. 공개 중인 항목은 먼저 공개를 내려야 보관할 수 있다.
 */
export async function setArchived(db: Db, schoolId: string, entryId: string, archived: boolean, userId: string) {
  const { entry, liveVersionId } = await getEntry(db, schoolId, entryId);
  if (archived && liveVersionId) throw Object.assign(new Error('공개 중인 항목은 보관할 수 없습니다. 먼저 공개를 내려 주세요.'), { code: 'P0001' });
  try {
    const r = await db.query(
      archived
        ? 'update public.site_entries set archived_at = now(), archived_by = $3, archived_by_token = null where id = $1 and school_id = $2 and archived_at is null'
        : 'update public.site_entries set archived_at = null, archived_by = null, archived_by_token = null where id = $1 and school_id = $2',
      archived ? [entry.id, schoolId, userId] : [entry.id, schoolId]);
    if (!r.rowCount && archived) throw new ValidationError('이미 보관한 항목입니다.');
  } catch (e) { dbError(e); }
  await db.query('select app.log_access($1, $2, $3)', [schoolId, archived ? 'site.entry_archive' : 'site.entry_restore', JSON.stringify({ id: entry.id, kind: entry.kind, key: entry.key })]);
  return { ok: true, archived };
}

// ── 그림 ─────────────────────────────────────────────────
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
/**
 * 올릴 파일 검사 (사람·작업 토큰 공용). 형식은 파일 앞부분으로 정한다(확장자·선언 형식 위조 방지).
 * 그림끼리 선언이 달라도(.jpg 인 PNG) 실제 형식으로 저장하고, PDF와 그림을 바꿔 선언하면 거부한다. PDF는 내용 검사를 거친다.
 */
export function checkUpload(file: { type: string; bytes: Buffer }, allowed = MIMES): string {
  const real = sniffMime(file.bytes);
  if (!real || !allowed.includes(real) || !allowed.includes(file.type)) throw new ValidationError('PNG·JPG·WEBP·GIF 그림이나 PDF만 올릴 수 있습니다.');
  if ((real === 'application/pdf') !== (file.type === 'application/pdf')) throw new ValidationError('파일 내용이 형식과 맞지 않습니다.');
  if (real === 'application/pdf') checkPdf(file.bytes);
  else if (!file.bytes.length || file.bytes.length > 5 * 1024 * 1024) throw new ValidationError('그림은 5MB 이하여야 합니다.');
  return real;
}
export async function uploadAsset(db: Db, schoolId: string, file: { name: string; type: string; bytes: Buffer }) {
  const mime = checkUpload(file);
  const sha = createHash('sha256').update(file.bytes).digest('hex');
  const { rows: [same] } = await db.query<{ id: string }>('select id from public.site_assets where school_id = $1 and sha256 = $2 limit 1', [schoolId, sha]);
  if (same) return { id: same.id, reused: true };
  // 43차(ADR 0018): R2가 설정돼 있으면 바이트는 R2에만, DB에는 메타데이터와 위치만
  const store = objectStore();
  if (store) await putVerified(store, objectKey(schoolId, sha), file.bytes, mime);
  try {
    const { rows: [a] } = await db.query<{ id: string }>(
      `insert into public.site_assets(school_id, name, mime, size_bytes, sha256, bytes, object_key) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [schoolId, file.name.slice(0, 200) || 'image', mime, file.bytes.length, sha, store ? null : file.bytes, store ? objectKey(schoolId, sha) : null]);
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
  const { rows: [a] } = await db.query<{ mime: string; bytes: Buffer | null; sha256: string; object_key: string | null }>(
    'select mime, bytes, sha256, object_key from public.site_assets where id = $1 and school_id = $2', [id, schoolId]);
  return a ?? null;
}

// ── 방문자 (공개된 판만) ─────────────────────────────────
export type PublicSite = {
  slug: string; school: string; default_lang: Lang; langs: Lang[]; theme: SiteTheme; title: LText;
  /** 91차: 방문·상담 신청 받음 */ inquiry_open?: boolean;
  stories: boolean; has_news: boolean; nav: NavEntry[];
  /** 126차(ADR 0046): 홈 쪽의 메뉴 주소 구역 — '홈' 아래 하위 메뉴 */ home_sections?: { anchor: string; title: LText }[];
  /** 47차: 학교 자체 주소(예: rungarunsuksa.vercel.app)로 보는 중이면 true — 링크 모양만 바뀐다 */
  on_own_host?: boolean;
  /** 49차: 로그인한 이 학교 관리자가 보는 중이면 true — 공개 화면 위에 관리 막대를 보인다 */
  viewer_admin?: boolean;
  /** 115차: 로그인한 이 학교 구성원(교사 포함)이 보는 중 — 관리 막대를 보인다(관리자 여부는 viewer_admin) */
  viewer_staff?: boolean;
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
  return asPublic(async (db) => (await db.query<{ mime: string; bytes: Buffer | null; sha256: string; object_key: string | null }>('select * from app.public_asset($1,$2)', [slug, id])).rows[0] ?? null);
}


/** 목록에 공개된 동화의 판 내용을 읽는다. 기존 공개 함수로만 접근하며, 비공개·unlisted 항목은 포함하지 않는다. */
export async function publicStoryContents(slug: string): Promise<{ key: string; content: Content }[]> {
  if (!SLUG.test(slug)) return [];
  return asPublic(async (db) => {
    const { rows } = await db.query<{ key: string; content: Content | null }>(`
      select entry ->> 'key' as key, app.public_entry($1, 'story', entry ->> 'key') -> 'content' as content
      from jsonb_array_elements(app.public_list($1, 'story')) as entry
    `, [slug]);
    return rows.flatMap((row) => row.content ? [{ key: row.key, content: row.content }] : []);
  });
}
