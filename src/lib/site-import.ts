/**
 * 31차: '기존 홈페이지 가져오기' 변환 (룽아룬숙사 이전 3단계, ADR 0008)
 *
 * 옛 사이트 내보내기 묶음(format "rung-arun-export/1")을 이 플랫폼의 쪽·소식·동화 시안으로 바꾼다.
 * DB·브라우저에 기대지 않는 순수 함수다. 그림은 아직 올리기 전이라 `@file:<묶음 안 경로>` 자리 표시로 두고,
 * 가져오기 화면이 그림을 한 장씩 올린 뒤 받은 그림 id로 바꿔 넣는다(fillAssets).
 *
 * 지키는 것
 * - 모두 시안으로만 만든다. 공개·사이트 열기는 학교 관리자가 확인한 뒤 따로 한다.
 * - 이미 있는 항목은 덮어쓰지 않고 새 판으로 더한다(가져오기 화면이 처리).
 * - 영상(수십 MB)은 올리지 않는다. 주소(YouTube·Drive)를 정한 뒤 영상 블록으로 넣는다.
 * - 옛 글의 <br>은 줄바꿈으로 바꾸고 HTML은 받지 않는다.
 */
import type { Block, Content, GalleryItem, Lang, LText, SectionItem, SiteProfile } from './site-shared';

export const FILE_REF = '@file:';
export type PlannedEntry = {
  kind: 'page' | 'news' | 'story'; key: string; visibility: 'public' | 'unlisted'; sort: number;
  content: Content; virtue?: string; character?: string; text_in_image?: boolean;
};
export type ImportPlan = {
  format: string; exportedAt: string | null;
  settings: { site_title: LText; langs: Lang[]; default_lang: Lang; theme: 'dawn' };
  entries: PlannedEntry[];
  /** 올릴 그림: 묶음 안 경로 (중복 없음) */
  files: string[];
  notes: string[];
};

type Raw = Record<string, unknown>;
type L = Partial<Record<string, string>>;
const LANG_KEYS: Lang[] = ['th', 'en', 'ko'];

/** 옛 글 한 칸 → LText. <br>은 줄바꿈, 다른 태그는 지운다. */
export function lt(v: unknown): LText {
  if (typeof v === 'string') return { th: clean(v) };
  if (!v || typeof v !== 'object') return {};
  const out: LText = {};
  for (const k of LANG_KEYS) { const s = (v as L)[k]; if (typeof s === 'string' && s.trim()) out[k] = clean(s); }
  return out;
}
function clean(s: string) { return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(); }
const has = (t: LText | undefined) => !!t && Object.values(t).some(Boolean);
const join = (parts: (LText | undefined)[], sep = '\n\n'): LText => {
  const out: LText = {};
  for (const k of LANG_KEYS) { const xs = parts.map((p) => p?.[k]).filter(Boolean); if (xs.length) out[k] = xs.join(sep); }
  return out;
};
const bullet = (t: LText): LText => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, `· ${v}`]));
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

export function isExportManifest(m: unknown): m is { format: string } {
  return !!m && typeof m === 'object' && String((m as Raw).format ?? '').startsWith('rung-arun-export/');
}

/**
 * 변환 본체.
 * @param content 묶음의 content.json
 * @param files   묶음 안 파일 경로 목록(그림 찾기용)
 * @param book    stories/<slug>/book.json (있으면 동화 하나로)
 * @param friends friends/pages.json (있으면 후원자 숨은 쪽으로) — 이 플랫폼 형식의 쪽 목록
 */
export function planImport(content: Raw, files: string[], book?: Raw | null, friends?: Raw | null): ImportPlan {
  if (!String(content.format ?? '').startsWith('rung-arun-export/')) throw new Error('룽아룬숙사 내보내기 묶음(rung-arun-export) 형식이 아닙니다.');
  const d = (content.defaults ?? {}) as Raw;
  const ui = (d.ui ?? {}) as Raw;
  const copy = (d.copy ?? {}) as Raw;
  const assets = (d.assets ?? {}) as Record<string, Raw>;
  const fileSet = new Set(files);
  const used = new Set<string>();
  const notes: string[] = [];

  /** 옛 사진 키(campus, workshop …) → 묶음 안 파일. 크기별 webp 가운데 1280 → 1108 → 960 → 880 → 800 순, 없으면 원본 */
  const photo = (key: unknown): string | undefined => {
    const a = typeof key === 'string' ? assets[key] : undefined;
    const src = typeof a?.src === 'string' ? a.src : typeof key === 'string' && key.startsWith('/assets/') ? key : undefined;
    if (!src) return undefined;
    const base = src.replace(/^\/assets\//, '').replace(/(-\d+)?\.(jpe?g|png|webp)$/i, '');
    const candidates = [1280, 1108, 960, 880, 800].map((w) => `assets/site/assets/${base}-${w}.webp`).concat(`assets/site/assets/${src.replace(/^\/assets\//, '')}`);
    const hit = candidates.find((c) => fileSet.has(c));
    if (!hit) { notes.push(`사진을 묶음에서 찾지 못했습니다: ${src}`); return undefined; }
    used.add(hit);
    return FILE_REF + hit;
  };
  const alt = (key: unknown) => (typeof key === 'string' && assets[key] ? lt(assets[key].alt) : {});
  const label = (k: string) => lt(ui[k]);
  /** 옛 글 칸: defaults 에 있으면 그것, 없으면 copy (옛 i.Cx 와 같은 순서) */
  const cx = (k: string) => (has(lt(d[k])) ? lt(d[k]) : lt(copy[k]));
  const same = (s: string): LText => ({ th: s, en: s, ko: s });
  /** 옛 첫 화면 구역의 영어 머리말(옛 코드에 고정된 글) */
  const EYEBROW = {
    home: same('UBON RATCHATHANI, THAILAND'), identity: same('RUNG · ARUN · SUKSA'), portrait: same('UNDER THE RAINBOW'),
    learning: same('LEARNING AT RUNG ARUN'), moments: same('EVERYDAY AT SCHOOL'), journal: same('SCHOOL JOURNAL'),
  };
  // 36차: 옛 방문 안내 띠(VisitBand) = 다음 단계 제목·글 + '방문' 단추
  const visit = (): Block => ({
    type: 'section', template: 'cta', title: label('nextStep'), body: lt(ui.nextStepBody),
    button: { label: label('visit'), href: '/p/contact' },
  });

  const entries: PlannedEntry[] = [];
  const page = (key: string, sort: number, c: Content) => entries.push({ kind: 'page', key, visibility: 'public', sort, content: c });
  // 옛 이야기 주소(story-<id>) → 이 플랫폼 소식 주소. 공지 표로 소식을 만들면 기본 이야기가 없으므로 소식 목록으로
  const posts = list((content.tables as Raw | undefined)?.news_posts).filter((p) => p.published === true);
  const storyIds = new Set(posts.length ? [] : list(d.stories).map((x) => String(x.id ?? '')));
  const storyHref = (id: string) => (storyIds.has(id) ? `/news/${safeKey(id, 'news')}` : '/news');

  // ── 첫 화면 (opening → identity → portrait → learning → moments → stories → visit) ──
  const stages = list(d.stages);
  const logo = photo('logo');
  const profile: SiteProfile = {
    logo: logo, tagline: lt(d.location),
    address: { th: String(d.addressThai ?? d.address ?? ''), en: String(d.address ?? ''), ko: String(d.address ?? '') },
    phone: (Array.isArray(d.phone) ? d.phone : []).filter((p): p is string => typeof p === 'string' && /^[0-9+()\- ]{3,30}$/.test(p)).slice(0, 3),
    facebook: typeof d.facebook === 'string' && d.facebook.startsWith('https://') ? d.facebook : undefined,
    footer: lt(d.knownNote), visit: { label: label('visit'), href: '/p/contact' },
  };
  if (!has(profile.address)) profile.address = undefined;
  page('home', 0, {
    title: has(lt(copy.homeTitle)) ? lt(copy.homeTitle) : lt(d.name), summary: lt(d.intro),
    cover: photo('campus'), head: { eyebrow: EYEBROW.home, layout: 'opening', link: { label: label('explore'), href: '/p/about' }, note: cx('campusDate') }, site: profile,
    blocks: [
      { type: 'section', template: 'text', variant: 'split', eyebrow: EYEBROW.identity, title: lt(copy.homeIdentity), body: cx('nameMeaning'), button: { label: label('about'), href: '/p/about' } },
      { type: 'section', template: 'media-left', variant: 'portrait', eyebrow: EYEBROW.portrait, title: lt(copy.homePortraitTitle), body: lt(copy.homePortraitBody),
        asset: photo('artwork'), alt: alt('artwork'), caption: alt('artwork'), button: { label: label('more'), href: storyHref('making') } },
      { type: 'section', template: 'cards', variant: 'index', eyebrow: EYEBROW.learning, title: label('stages'), button: { label: label('viewLearning'), href: '/p/curriculum' },
        items: stages.map((s): SectionItem => ({ title: lt(s.title), body: lt(s.subtitle), href: '/p/curriculum' })) },
      { type: 'section', template: 'photos', variant: 'moments', eyebrow: EYEBROW.moments, title: lt(copy.homeMomentsTitle), button: { label: label('viewGallery'), href: '/p/gallery' },
        items: ['workshop', 'together', 'circle'].map((k, n) => ({ asset: photo(k), alt: alt(k), title: alt(k), body: same(['MAKE', 'SHARE', 'TOGETHER'][n]), href: n === 0 ? storyHref('making') : '/p/life' })) },
      { type: 'news_list', eyebrow: EYEBROW.journal, title: label('news'), count: 2, style: 'cards' },
      visit(),
    ],
  });

  // ── 학교 소개: 개요(사진 + 정보 4줄) → 이름 뜻(로고) → 교육 가치(사진–글 줄) → 방문 안내 ──
  const values = list(d.values);
  page('about', 10, {
    title: label('about'), summary: lt(d.intro),
    blocks: [
      { type: 'section', template: 'media-left', variant: 'overview', asset: photo('campus'), alt: alt('campus'), caption: alt('campus'),
        items: [
          { title: label('location'), body: cx('location') }, { title: label('stageLabel'), body: label('schoolStages') },
          { title: label('type'), body: label('schoolType') }, { title: lt(copy.aboutPeople), body: label('unknown') },
        ].filter((f) => has(f.title) && has(f.body)) },
      { type: 'section', template: 'media-left', variant: 'emblem', asset: logo, alt: lt(d.name), title: label('nameTitle'), body: cx('nameMeaning') },
      { type: 'section', template: 'cards', variant: 'rows', title: cx('philosophyTitle'), body: cx('philosophyIntro'),
        items: values.map((v, n) => { const k = ['artwork', 'together', 'circle'][n]; return { title: lt(v.title), body: lt(v.body), asset: k ? photo(k) : undefined, alt: k ? alt(k) : undefined }; }) },
      visit(),
    ],
  });

  // ── 교육 과정: 단계(사진 | 글·핵심·메모·입학 링크) → 활동 → 자료 안내 → 방문 안내 ──
  page('curriculum', 20, {
    title: label('curriculum'), summary: lt(d.curriculumNote),
    blocks: [
      { type: 'heading', text: label('stages') },
      ...stages.map((s): Block => ({
        type: 'section', template: 'media-left', title: lt(s.title),
        body: join([lt(s.body), join((Array.isArray(s.points) ? s.points : []).map((p) => bullet(lt(p))), '\n'), lt(s.note)]),
        asset: photo(s.photo), alt: alt(s.photo), button: { label: label('admissions'), href: '/p/admissions' },
      })),
      { type: 'section', template: 'cards', title: label('activities'), items: list(d.activities).map((a) => ({ title: lt(a.title), body: lt(a.body) })) },
      { type: 'notice', text: cx('knownNote') },
      visit(),
    ],
  });

  // ── 학교생활: 주요 활동 3줄(사진 | 제목·글·더 보기) → 하루 생활 질문 → 갤러리 단추 → 방문 안내 ──
  const lifeRows: [string, number, string][] = [['workshop', 0, 'making'], ['circle', 2, 'together'], ['classroom', 1, 'together']];
  page('life', 30, {
    title: label('life'), summary: lt(d.hero),
    blocks: [
      { type: 'section', template: 'cards', variant: 'rows',
        items: lifeRows.filter(([, n]) => values[n]).map(([k, n, story]) => ({ title: lt(values[n].title), body: lt(values[n].body), asset: photo(k), alt: alt(k), href: storyHref(story) })) },
      { type: 'section', template: 'steps', variant: 'questions', title: cx('dayTitle'), body: cx('dayNote'), items: (Array.isArray(d.dayQuestions) ? d.dayQuestions : []).map((q) => ({ title: lt(q) })) },
      { type: 'section', template: 'cta', button: { label: label('viewGallery'), href: '/p/gallery' } },
      visit(),
    ],
  });

  // ── 갤러리: 기본 사진 7장 + 버킷 사진 중 갤러리에 넣은 것 ──
  const galleryKeys = ['workshop', 'artwork', 'circle', 'together', 'classroom', 'campus', 'entrance'];
  const items: GalleryItem[] = [];
  for (const k of galleryKeys) {
    const f = photo(k);
    if (f) items.push({ asset: f, alt: alt(k), category: typeof assets[k]?.category === 'string' ? String(assets[k].category) : undefined });
  }
  const tables = (content.tables ?? {}) as Record<string, unknown>;
  for (const p of list(tables.photos)) {
    if (p.in_gallery !== true || typeof p.path !== 'string') continue;
    const f = `assets/bucket/${p.path}`;
    if (!fileSet.has(f)) { notes.push(`갤러리 사진을 묶음에서 찾지 못했습니다: ${p.path}`); continue; }
    used.add(f);
    items.unshift({ asset: FILE_REF + f, alt: { th: String(p.alt_th ?? ''), en: String(p.alt_en ?? ''), ko: String(p.alt_ko ?? '') }, category: typeof p.category === 'string' ? p.category : undefined });
  }
  page('gallery', 40, {
    title: label('gallery'), summary: lt(d.galleryIntro),
    blocks: items.length ? [{
      type: 'gallery', assets: items.map((i) => i.asset), items,
      filters: (['classroom', 'art', 'grounds'] as const).filter((c) => items.some((i) => i.category === c)).map((c) => ({ key: c, label: label(c) })),
    }] : [],
  });

  // ── 입학 안내: 상담 준비(안내 상자 | 포스터) → 절차 → 서류 → 자주 묻는 질문 → 방문 안내 ──
  page('admissions', 60, {
    title: label('admissions'), summary: lt(d.admissionsIntro),
    blocks: [
      { type: 'section', template: 'media-right', variant: 'prep', title: label('inquiryPrep'), body: cx('admissionsArchive'),
        button: { label: label('contactSchool'), href: '/p/contact' }, asset: photo('poster'), alt: alt('poster') },
      { type: 'section', template: 'steps', items: list(d.admissionSteps).map((s) => ({ title: lt(s.title), body: lt(s.body) })) },
      { type: 'section', template: 'facts', variant: 'aside', title: label('documents'), items: (Array.isArray(d.documents) ? d.documents : []).map((x, i) => ({ title: same(String(i + 1)), body: lt(x) })) },
      { type: 'section', template: 'facts', variant: 'faq', title: label('faq'), items: list(d.faq).map((f) => ({ title: lt(f.q), body: lt(f.a) })) },
      visit(),
    ],
  });

  // ── 문의·위치: 사무실(전화·운영 시간·Facebook) | 위치(입구 사진·주소·지도) → 상담 질문 ──
  const mapQuery = encodeURIComponent([lt(d.name).en, String(d.address ?? '')].filter(Boolean).join(' '));
  const phones = profile.phone ?? [];
  page('contact', 70, {
    title: label('contact'), summary: lt(d.contactIntro),
    blocks: [
      { type: 'section', template: 'facts', variant: 'half', title: label('office'),
        items: [
          ...(phones.length ? [{ title: { th: 'โทร', en: 'Phone', ko: '전화' }, body: same(phones.join('\n')) }] : []),
          { title: label('hours'), body: join([lt(d.officeHours), lt(d.contactNote)]) },
        ].filter((f) => has(f.body)),
        ...(profile.facebook ? { button: { label: label('facebook'), href: profile.facebook } } : {}) },
      { type: 'section', template: 'banner', variant: 'half', asset: photo('entrance'), alt: alt('entrance'), title: label('location'), body: profile.address,
        ...(String(d.address ?? '') ? { button: { label: label('map'), href: `https://www.google.com/maps/search/?api=1&query=${mapQuery}` } } : {}) },
      { type: 'section', template: 'steps', variant: 'questions', title: label('inquiryPrep'), items: (Array.isArray(d.dayQuestions) ? d.dayQuestions : []).map((q) => ({ title: lt(q) })) },
    ],
  });

  // ── 소식: 공지 표(news_posts)가 있으면 그것, 없으면 기본 소식 ──
  if (posts.length) {
    posts.forEach((p, i) => {
      const L3 = (f: string): LText => lt({ th: p[`${f}_th`], en: p[`${f}_en`], ko: p[`${f}_ko`] });
      entries.push({ kind: 'news', key: safeKey(String(p.slug ?? p.id), `news-${i + 1}`), visibility: 'public', sort: i, content: {
        title: L3('title'), summary: L3('teaser'), cover: photo(p.photo),
        blocks: [{ type: 'text', text: L3('body') }],
      } });
    });
  } else {
    list(d.stories).forEach((s, i) => {
      const body = (Array.isArray(s.body) ? s.body : []).map((x) => lt(x));
      entries.push({ kind: 'news', key: safeKey(String(s.id ?? ''), `story-${i + 1}`), visibility: 'public', sort: i, content: {
        title: lt(s.title), summary: lt(s.teaser), cover: photo(s.photo),
        blocks: [
          ...body.map((t): Block => ({ type: 'text', text: t })),
          ...(photo(s.secondary) ? [{ type: 'image' as const, asset: photo(s.secondary)!, alt: alt(s.secondary) }] : []),
          ...(has(lt(copy.newsSourceNote)) ? [{ type: 'notice' as const, text: lt(copy.newsSourceNote) }] : []),
        ],
      } });
    });
  }

  // ── 성품 동화 ──
  if (book && Array.isArray(book.pages)) {
    const slug = safeKey(String(book.slug ?? ''), 'story');
    const dir = files.find((f) => f.endsWith(`stories/${book.slug}/book.json`))?.replace(/book\.json$/, '') ?? `stories/${book.slug}/`;
    const pages = list(book.pages).sort((a, b) => Number(a.no) - Number(b.no));
    const blocks: Block[] = pages.map((p) => {
      const f = `${dir}${String(p.image ?? '')}`;
      if (fileSet.has(f)) used.add(f); else notes.push(`동화 쪽 그림을 묶음에서 찾지 못했습니다: ${p.image}`);
      const loc = (book.locale === 'en' || book.locale === 'ko' ? book.locale : 'th') as Lang;
      return { type: 'story_page', asset: fileSet.has(f) ? FILE_REF + f : undefined, text: { [loc]: String(p.text ?? '').trim() } };
    });
    const title: LText = { th: String(book.title ?? '').trim() || undefined, ko: String(book.title_ko ?? '').trim() || undefined };
    if (book.video) notes.push('동화 영상은 크기가 커서 올리지 않았습니다. YouTube 일부 공개나 Google Drive 주소를 정하면 동화 편집에서 영상 블록으로 넣으세요.');
    if (!book.virtue) notes.push('동화의 성품 이름이 비어 있습니다. 공개 전에 동화 편집에서 정해 주세요.');
    const first = blocks.find((b) => b.type === 'story_page' && b.asset) as Extract<Block, { type: 'story_page' }> | undefined;
    entries.push({
      kind: 'story', key: slug, visibility: 'public', sort: 0, virtue: typeof book.virtue === 'string' ? book.virtue : '',
      character: (Array.isArray(book.character) ? book.character : []).map(String).join(' · ').slice(0, 120),
      text_in_image: true, content: { title: has(title) ? title : { th: slug }, cover: first?.asset, blocks },
    });
  }

  // ── 후원자(/friends): 숨은 쪽. 이 플랫폼 형식 그대로 받는다 ──
  if (friends && Array.isArray(friends.pages)) {
    list(friends.pages).forEach((p, i) => {
      const key = safeKey(String(p.key ?? ''), `friends-${i + 1}`);
      const c = (p.content ?? {}) as Content;
      for (const ref of collectRefs(c)) { if (fileSet.has(ref)) used.add(ref); else notes.push(`후원자 쪽 그림을 묶음에서 찾지 못했습니다: ${ref}`); }
      entries.push({ kind: 'page', key, visibility: 'unlisted', sort: 900 + i, content: withRefs(c, (ref) => (fileSet.has(ref) ? FILE_REF + ref : undefined)) as Content });
    });
  } else {
    notes.push('후원자 쪽(friends/pages.json)이 묶음에 없어 /friends 는 가져오지 않았습니다.');
  }

  const langs = (Array.isArray((content.languages as Raw | undefined)?.school) ? ((content.languages as Raw).school as string[]) : ['th', 'en', 'ko'])
    .filter((l): l is Lang => LANG_KEYS.includes(l as Lang));
  return {
    format: String(content.format), exportedAt: typeof content.exportedAt === 'string' ? content.exportedAt : null,
    settings: { site_title: lt(d.name), langs: langs.length ? langs : ['th', 'en', 'ko'], default_lang: langs[0] ?? 'th', theme: 'dawn' },
    entries: entries.map((e) => ({ ...e, content: prune(e.content) as Content })), files: [...used], notes: [...new Set(notes)],
  };
}

function safeKey(v: string, fallback: string) {
  const k = v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return /^[a-z0-9]/.test(k) ? k : fallback;
}

/** 빈 글·빈 칸을 지운다(서버 검사와 같은 모양으로) */
function prune(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(prune).filter((x) => x !== undefined);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const c = prune(x);
      if (c === undefined || c === '' || (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)) continue;
      o[k] = c;
    }
    return o;
  }
  return v;
}

/** 내용 속 그림 자리(묶음 경로)를 모두 찾는다: `@file:경로` 또는 friends/pages.json 의 `{"file":"경로"}` 대신 쓰는 문자열 */
function collectRefs(c: unknown, out = new Set<string>()): Set<string> {
  if (typeof c === 'string' && c.startsWith(FILE_REF)) out.add(c.slice(FILE_REF.length));
  else if (Array.isArray(c)) c.forEach((x) => collectRefs(x, out));
  else if (c && typeof c === 'object') Object.values(c).forEach((x) => collectRefs(x, out));
  return out;
}
function withRefs(c: unknown, fn: (path: string) => string | undefined): unknown {
  if (typeof c === 'string' && c.startsWith(FILE_REF)) return fn(c.slice(FILE_REF.length));
  if (Array.isArray(c)) return c.map((x) => withRefs(x, fn));
  if (c && typeof c === 'object') return Object.fromEntries(Object.entries(c).map(([k, x]) => [k, withRefs(x, fn)]));
  return c;
}

/**
 * 올린 그림 id로 자리 표시를 바꾼다. 올리지 못한 그림 자리는 지우고,
 * 그림이 꼭 있어야 하는 블록(그림 한 장)이나 사진이 하나도 남지 않은 갤러리는 블록째 뺀다.
 */
export function fillAssets(value: Content, ids: Record<string, string>): Content {
  const c = prune(withRefs(value, (p) => ids[p])) as Content;
  const blocks = (c.blocks ?? []).flatMap((b): Block[] => {
    if (b.type === 'image') return b.asset ? [b] : [];
    if (b.type === 'gallery') {
      const items = b.items?.filter((i) => i.asset);
      const assets = items ? items.map((i) => i.asset) : (b.assets ?? []).filter(Boolean);
      return assets.length ? [{ ...b, assets, ...(items ? { items } : {}) }] : [];
    }
    return [b];
  });
  return { ...c, blocks };
}
