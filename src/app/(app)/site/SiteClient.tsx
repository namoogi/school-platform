'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileDrop, type FileDropContext } from '@/components/FileDrop';
import Link from 'next/link';
import { uploadWithProgress } from '@/lib/file-check';
import { ArrowDown, ArrowUp, Eye, FileDown, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { BLOCK_LABEL, KIND_LABEL, PHOTO_CONSENT, LANG_LABEL, LANGS, SECTION_LABEL, SECTION_TEMPLATES, SECTION_VARIANTS, VARIANT_LABEL, type Block, type Content, type EntryKind, type Lang, type LText, type SectionItem, type SectionTemplate, type SiteProfile, type SiteSettings, type SiteTheme, SITE_THEMES } from '@/lib/site-shared';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '저장하지 못했습니다.');
  return data;
}

/** 목록에서 저장된 최신 판을 공개한다. 편집기에서 아직 저장하지 않은 글은 포함하지 않는다. */
export function EntryPublishControl({ id, title, latestVersion, liveVersion }: { id: string; title: string; latestVersion: number; liveVersion: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  async function change(publish: boolean) {
    setBusy(true); setMsg(null);
    try {
      await send(`/api/site/entries/${id}/publish`, 'POST', publish ? {} : { versionId: null });
      setMsg({ tone: 'success', text: publish ? '저장된 최신 판을 공개했습니다.' : '공개를 해제했습니다.' });
      startTransition(() => router.refresh());
    } catch (err) { setMsg({ tone: 'danger', text: (err as Error).message }); }
    finally { setBusy(false); }
  }
  return <div className="site-list-publish" data-testid="entry-publish-control" role="group" aria-label={`${title} 공개 설정`}>
    <div className="row-wrap">
      {liveVersion !== latestVersion && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || refreshing} onClick={() => change(true)} title="저장된 최신 판을 공개합니다">{liveVersion === null ? '공개하기' : '새 판 공개'}</button>}
      {liveVersion !== null && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || refreshing} onClick={() => change(false)}>공개 해제</button>}
    </div>
    {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
  </div>;
}

// ── 설정 ─────────────────────────────────────────────────
/**
 * 저장 뒤 화면이 새 설정을 다시 읽으면 폼이 `key={updated_at}`로 새로 그려져 상태가 사라진다(88차 e2e 불안정의 원인).
 * 그래서 성공 표시는 주소의 `saved=1`로 넘겨, 새로 그려진 폼도 같은 표시로 시작한다.
 */
export function SiteSettingsForm({ initial, schoolName, saved = false }: { initial: SiteSettings | null; schoolName: string; saved?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState({
    public_slug: initial?.public_slug ?? '', langs: (initial?.langs ?? ['ko']) as Lang[], default_lang: (initial?.default_lang ?? 'ko') as Lang,
    theme: initial?.theme ?? 'campus', site_title: (initial?.site_title ?? { ko: schoolName }) as LText, is_open: initial?.is_open ?? false, inquiry_open: initial?.inquiry_open ?? false,
  });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(saved ? { tone: 'success', text: '저장했습니다.' } : null);
  // 표시를 넘겨받았으면 주소에서 saved=1을 지운다(새로 고침·즐겨찾기로 다시 열 때 저장한 것처럼 보이지 않게). 서버를 다시 부르지 않는다
  useEffect(() => {
    if (!saved) return;
    const u = new URL(window.location.href);
    u.searchParams.delete('saved');
    window.history.replaceState(window.history.state, '', u.pathname + u.search);
  }, [saved]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await send('/api/site/settings', 'POST', s); setMsg({ tone: 'success', text: '저장했습니다.' }); router.replace('/site?box=settings&saved=1', { scroll: false }); router.refresh(); }
    catch (err) { setMsg({ tone: 'danger', text: (err as Error).message }); }
  }
  const toggleLang = (l: Lang) => setS((x) => {
    const langs = x.langs.includes(l) ? x.langs.filter((y) => y !== l) : [...x.langs, l];
    return { ...x, langs, default_lang: langs.includes(x.default_lang) ? x.default_lang : (langs[0] ?? 'ko') };
  });
  return (
    <form className="card site-form" onSubmit={save} data-testid="site-settings">
      <h2>홈페이지 설정</h2>
      <label>주소 이름 <span className="fine">onschools.vercel.app/s/<b>{s.public_slug || '이름'}</b></span>
        <input value={s.public_slug} onChange={(e) => setS({ ...s, public_slug: e.target.value })} placeholder="예: rungarunsuksa" required />
      </label>
      <fieldset><legend>언어</legend>
        <div className="row-wrap">{LANGS.map((l) => (
          <label key={l} className="radio"><input type="checkbox" checked={s.langs.includes(l)} onChange={() => toggleLang(l)} /> {LANG_LABEL[l]}</label>))}</div>
      </fieldset>
      <label>기본 언어
        <select value={s.default_lang} onChange={(e) => setS({ ...s, default_lang: e.target.value as Lang })}>
          {s.langs.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
        </select>
      </label>
      {s.langs.map((l) => (
        <label key={l}>사이트 이름 ({LANG_LABEL[l]})
          <input value={s.site_title[l] ?? ''} onChange={(e) => setS({ ...s, site_title: { ...s.site_title, [l]: e.target.value } })} />
        </label>
      ))}
      <label>화면 모양
        <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value as SiteTheme })} data-testid="site-theme">
          {SITE_THEMES.map((x) => <option key={x.key} value={x.key}>{x.name} — {x.note}</option>)}
        </select>
      </label>
      <label className="radio"><input type="checkbox" checked={s.is_open} onChange={(e) => setS({ ...s, is_open: e.target.checked })} /> 홈페이지 열기 (방문자가 공개한 판을 볼 수 있음)</label>
      {/* 91차(ADR 0036): 방문·상담 신청 — 쪽에 '방문·상담 신청' 블록을 넣고 이것을 켜면 방문자가 신청을 남긴다 */}
      <label className="radio"><input type="checkbox" checked={s.inquiry_open} onChange={(e) => setS({ ...s, inquiry_open: e.target.checked })} data-testid="site-inquiry-open" /> 방문·상담 신청 받기 (이름·연락처를 받습니다. 학교 관리자만 보고, 1년이 지나면 가릴 수 있습니다)</label>
      {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary">설정 저장</button></div>
    </form>
  );
}

// ── 새 항목 ──────────────────────────────────────────────
export function NewEntryForm({ kind, disabled, initialOpen = false }: { kind: EntryKind; disabled: boolean; initialOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [f, setF] = useState({ key: '', title: '', virtue: '', character: '' });
  const [err, setErr] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const r = await send('/api/site/entries', 'POST', { kind, key: f.key, virtue: f.virtue, character: f.character, content: { title: { ko: f.title }, blocks: [] } });
      setOpen(false); setF({ key: '', title: '', virtue: '', character: '' });
      router.push(`/site?box=${kind}&id=${r.id}`); router.refresh();
    } catch (x) { setErr((x as Error).message); }
  }
  if (!open) return <div className="site-new"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={disabled} data-testid="new-entry"><Plus size={16} aria-hidden="true" />새 {KIND_LABEL[kind]}</button></div>;
  return (
    <form className="site-new site-form" onSubmit={create}>
      <label>제목<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
      <label>주소 이름 <span className="fine">영문 소문자·숫자·-{kind === 'page' ? ' (첫 화면은 home)' : ''}</span>
        <input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder={kind === 'story' ? 'what-rain-cannot-erase' : kind === 'page' ? 'about' : 'open-day'} required /></label>
      {kind === 'story' && <>
        <label>성품<input value={f.virtue} onChange={(e) => setF({ ...f, virtue: e.target.value })} placeholder="예: 우정" /></label>
        <label>주인공 캐릭터<input value={f.character} onChange={(e) => setF({ ...f, character: e.target.value })} /></label>
      </>}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary btn-sm">시안 만들기</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>취소</button></div>
    </form>
  );
}

// ── 편집기 ───────────────────────────────────────────────
type Detail = {
  entry: { id: string; kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; meta: Record<string, string> };
  versions: { id: string; version: number; content: Content; note: string | null; created_at: string }[];
  publications: { id: number; version_id: string | null; published_at: string }[];
  liveVersionId: string | null;
};
type Asset = { id: string; name: string; mime?: string };
const NEW_BLOCK: Record<Block['type'], () => Block> = {
  heading: () => ({ type: 'heading', text: {} }), text: () => ({ type: 'text', text: {} }), notice: () => ({ type: 'notice', text: {} }),
  image: () => ({ type: 'image', asset: '', alt: {} }), gallery: () => ({ type: 'gallery', assets: [] }),
  video: () => ({ type: 'video', url: {} }), story_page: () => ({ type: 'story_page', text: {} }),
  section: () => ({ type: 'section', template: 'text', title: {}, body: {} }), news_list: () => ({ type: 'news_list', count: 3, style: 'cards' }),
  download: () => ({ type: 'download', asset: '', label: {} }),
  inquiry: () => ({ type: 'inquiry', title: {}, body: {} }),
};
type SectionBlock = Extract<Block, { type: 'section' }>;
const HAS_PHOTO: SectionTemplate[] = ['media-left', 'media-right', 'banner'];
const HAS_ITEMS: SectionTemplate[] = ['cards', 'photos', 'facts', 'steps'];
/** 비교용 정규화: 빈 글·빈 묶음·undefined 를 빼고 비교한다(서버 검사가 빈 칸을 정리하므로) */
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c === undefined || c === '' || (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)) continue; o[k] = c; }
    return o;
  }
  return v;
}
const norm = (c: Content) => JSON.stringify(clean(c));
const when = (d: string) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function LangFields({ value, onChange, langs, label, multiline }: { value: LText | undefined; onChange: (v: LText) => void; langs: Lang[]; label: string; multiline?: boolean }) {
  return (
    <div className="lang-fields">
      {langs.map((l) => (
        <label key={l}>{label} <span className="fine">{LANG_LABEL[l]}</span>
          {multiline
            ? <textarea rows={3} value={value?.[l] ?? ''} lang={l} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
            : <input value={value?.[l] ?? ''} lang={l} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />}
        </label>
      ))}
    </div>
  );
}

function AssetPick({ value, onChange, assets, onUploaded, label, pdf = false, languageImage = false }: { value?: string; onChange: (id: string) => void; assets: Asset[]; onUploaded: (a: Asset) => void; label: string; pdf?: boolean; languageImage?: boolean }) {
  async function upload([file]: File[], { signal, progress }: FileDropContext) {
    const form = new FormData(); form.append('file', file);
    const res = await uploadWithProgress('/api/site/assets', form, { signal, onProgress: progress });
    const data = res.body as { id?: string; error?: string };
    if (!res.ok || !data.id) throw new Error(data.error ?? '올리지 못했습니다.');
    onUploaded({ id: data.id, name: file.name, mime: file.type }); onChange(data.id);
    return `‘${file.name}’을(를) 올리고 골랐습니다.`;
  }
  // 34차: PDF 칸에는 PDF만, 그림 칸에는 그림만 보인다
  const choices = assets.filter((a) => (a.mime === 'application/pdf') === pdf && (!languageImage || ['image/png', 'image/jpeg', 'image/webp'].includes(a.mime ?? '')));
  return (
    <div className="asset-pick">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value && !pdf ? <img src={`/site/assets/${value}`} alt="" /> : <span className="asset-empty" aria-hidden="true">{pdf ? <FileDown size={20} /> : <ImagePlus size={20} />}</span>}
      <div>
        <label>{label}
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">고르지 않음</option>
            {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <FileDrop
          compact label={pdf ? '새 PDF 올리기' : '새 그림 올리기'} onFiles={upload}
          accept={pdf ? ['application/pdf', '.pdf'] : languageImage ? ['image/png', 'image/jpeg', 'image/webp'] : ['image/png', 'image/jpeg', 'image/webp', 'image/gif']}
          typeLabel={pdf ? 'PDF' : languageImage ? 'PNG·JPG·WEBP' : 'PNG·JPG·WEBP·GIF'} maxSize={(pdf ? 4 : 5) * 1024 * 1024}
          hint={pdf ? '웹용으로 줄인 파일' : <span data-testid="photo-consent">{PHOTO_CONSENT}</span>}
        />
      </div>
    </div>
  );
}

export function EntryEditor({ detail, langs, canPublish, assets: initialAssets, publicHref }: { detail: Detail; langs: Lang[]; canPublish: boolean; assets: Asset[]; publicHref: string | null }) {
  const router = useRouter();
  const latest = detail.versions[0];
  const [content, setContent] = useState<Content>(() => structuredClone(latest.content));
  const [assets, setAssets] = useState(initialAssets);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // 새 판이 오면(저장·공개 뒤 새로 고침) — 내가 방금 저장한 내용이면 입력을 건드리지 않는다(그 사이 고친 글을 지키기 위해).
  // 다른 사람이 만든 판처럼 내용이 다르면 그 판으로 맞춘다. 다시 마운트하지 않아야 결과 안내가 남는다.
  const [shownId, setShownId] = useState(latest.id);
  const [sent, setSent] = useState<string | null>(null);
  if (shownId !== latest.id) {
    setShownId(latest.id);
    if (sent === null || sent !== norm(latest.content)) { setContent(structuredClone(latest.content)); setNote(''); }
    setSent(null);
  }
  const dirty = norm(content) !== norm(latest.content);
  const live = detail.versions.find((v) => v.id === detail.liveVersionId);
  const isStory = detail.entry.kind === 'story';

  const setBlock = (i: number, b: Block) => setContent((c) => ({ ...c, blocks: c.blocks.map((x, j) => (j === i ? b : x)) }));
  const move = (i: number, d: number) => setContent((c) => { const b = [...c.blocks]; const [x] = b.splice(i, 1); b.splice(i + d, 0, x); return { ...c, blocks: b }; });
  const remove = (i: number) => setContent((c) => ({ ...c, blocks: c.blocks.filter((_, j) => j !== i) }));
  const add = (t: Block['type']) => setContent((c) => ({ ...c, blocks: [...c.blocks, NEW_BLOCK[t]()] }));
  const uploaded = (a: Asset) => setAssets((xs) => (xs.some((x) => x.id === a.id) ? xs : [a, ...xs]));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); router.refresh(); }
    catch (e) { setMsg({ tone: 'danger', text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  const save = () => run(() => { setSent(norm(content)); return send(`/api/site/entries/${detail.entry.id}/versions`, 'POST', { content, note }); }, '새 판으로 저장했습니다.');
  const publishLatest = () => run(async () => {
    if (dirty) { setSent(norm(content)); await send(`/api/site/entries/${detail.entry.id}/versions`, 'POST', { content, note }); }
    await send(`/api/site/entries/${detail.entry.id}/publish`, 'POST', {});
  }, '공개했습니다.');

  return (
    <div className="site-editor" data-testid="entry-editor">
      <div className="card">
        <div className="between site-editor-header">
          <div>
            <p className="fine">{KIND_LABEL[detail.entry.kind]} · /{detail.entry.key} · 최신 {latest.version}판{live ? ` · 공개 중 ${live.version}판` : ' · 공개 안 함'}</p>
            <div className="site-editor-title">
              <h2>{content.title[langs[0]] || content.title.ko || detail.entry.key}</h2>
              {canPublish && <button type="button" className="btn btn-primary btn-sm" onClick={publishLatest} disabled={busy || (!dirty && live?.id === latest.id)}>{dirty ? '저장하고 공개' : '최신 판 공개'}</button>}
            </div>
          </div>
          <div className="actions">
            <Link className="btn btn-ghost btn-sm" href={`/site/preview/${detail.entry.id}`} target="_blank"><Eye size={16} aria-hidden="true" />시안 미리보기</Link>
            {publicHref && live && <Link className="btn btn-ghost btn-sm" href={publicHref} target="_blank">공개본 보기</Link>}
          </div>
        </div>
        {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
        {isStory && (canPublish
          ? <StoryMeta id={detail.entry.id} virtue={detail.entry.meta.virtue ?? ''} character={detail.entry.meta.character ?? ''} />
          : detail.entry.meta.virtue && <p className="fine">성품: {detail.entry.meta.virtue}{detail.entry.meta.character ? ` · 주인공: ${detail.entry.meta.character}` : ''}</p>)}
        <LangFields label="제목" value={content.title} langs={langs} onChange={(title) => setContent({ ...content, title })} />
        <LangFields label="요약" value={content.summary} langs={langs} multiline onChange={(summary) => setContent({ ...content, summary })} />
        <AssetPick label="표지 그림" value={content.cover} assets={assets} onUploaded={uploaded} onChange={(cover) => setContent({ ...content, cover: cover || undefined })} />
      </div>
      {detail.entry.kind === 'page' && detail.entry.key === 'home' && (
        <ProfileFields value={content.site ?? {}} langs={langs} assets={assets} onUploaded={uploaded} onChange={(site) => setContent({ ...content, site })} />
      )}

      <ol className="block-list">
        {content.blocks.map((b, i) => (
          <li key={i} className="card block-card" data-block={b.type}>
            <div className="between">
              <strong>{i + 1}. {BLOCK_LABEL[b.type]}</strong>
              <div className="actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 위로`}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === content.blocks.length - 1} aria-label={`${i + 1}번 아래로`}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} aria-label={`${i + 1}번 빼기`}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </div>
            {(b.type === 'heading' || b.type === 'notice') && <LangFields label="글" value={b.text} langs={langs} onChange={(text) => setBlock(i, { ...b, text })} />}
            {(b.type === 'image' || b.type === 'story_page') && <details className="site-language-images">
              <summary>언어별 그림 (선택 사항)</summary>
              <p className="fine">번역 그림을 준비한 뒤 해당 언어에 등록하세요. 비워 두면 원본 그림을 사용합니다. 그림을 자동 생성하지 않습니다.</p>
              {LANGS.map((lang) => <AssetPick key={lang} languageImage label={`${LANG_LABEL[lang]} 그림`} value={b.images?.[lang]?.asset} assets={assets} onUploaded={uploaded}
                onChange={(asset) => { const images = { ...b.images }; if (asset) images[lang] = { asset }; else delete images[lang]; setBlock(i, { ...b, images }); }} />)}
            </details>}
            {b.type === 'text' && <LangFields label="글" value={b.text} langs={langs} multiline onChange={(text) => setBlock(i, { ...b, text })} />}
            {b.type === 'image' && <>
              <AssetPick label="그림" value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset })} />
              <LangFields label="대체 글" value={b.alt} langs={langs} onChange={(alt) => setBlock(i, { ...b, alt })} />
            </>}
            {b.type === 'gallery' && <>
              <label><input type="checkbox" checked={b.download === 'png'} onChange={(e) => setBlock(i, { ...b, download: e.target.checked ? 'png' : undefined, scene: e.target.checked ? b.scene ?? 1 : undefined })} />장면 캐릭터 PNG 내려받기</label>
              {b.download === 'png' && <label>장면 번호<input type="number" min={1} max={200} value={b.scene ?? 1} onChange={(e) => setBlock(i, { ...b, scene: Number(e.target.value) })} /></label>}
              <LangFields label="장면·사진 묶음 설명" value={b.caption} langs={langs} onChange={(caption) => setBlock(i, { ...b, caption })} />
              {b.download === 'png' && (b.items ?? b.assets.map((asset) => ({ asset, alt: {} as LText }))).map((item, k) => <LangFields key={k} label={`${k + 1}번 캐릭터 이름·대체 글`} value={item.alt} langs={langs} onChange={(alt) => setBlock(i, { ...b, items: (b.items ?? b.assets.map((asset) => ({ asset, alt: {} as LText }))).map((it, j) => j === k ? { ...it, alt } : it) })} />)}
              <div className="gallery-pick">{b.assets.map((a, k) => (
                <span key={a + k}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/site/assets/${a}`} alt="" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlock(i, { ...b, assets: b.assets.filter((_, j) => j !== k), items: b.items?.filter((_, j) => j !== k) })}>빼기</button></span>))}</div>
              <AssetPick label="사진 더하기" assets={assets} onUploaded={uploaded} onChange={(a) => a && setBlock(i, { ...b, assets: [...b.assets, a], items: b.items ? [...b.items, { asset: a }] : undefined })} />
            </>}
            {b.type === 'gallery' && b.items && <p className="fine">사진마다 묶음·대체 글이 있습니다({b.items.length}장{b.filters ? ` · 거르기 ${b.filters.length}개` : ''}). 사진을 빼면 함께 빠집니다.</p>}
            {b.type === 'section' && <SectionFields b={b} langs={langs} assets={assets} onUploaded={uploaded} onChange={(nb) => setBlock(i, nb)} />}
            {b.type === 'inquiry' && <>
              <LangFields label="신청 칸 제목" value={b.title} langs={langs} onChange={(title) => setBlock(i, { ...b, title })} />
              <LangFields label="신청 안내" value={b.body} langs={langs} multiline onChange={(body) => setBlock(i, { ...b, body })} />
              <p className="fine">홈페이지 설정에서 '방문·상담 신청 받기'를 켜야 방문자에게 보입니다. 받은 신청은 학교 관리자만 '홈페이지 → 신청'에서 봅니다.</p>
            </>}
            {b.type === 'news_list' && <>
              <LangFields label="제목" value={b.title} langs={langs} onChange={(title) => setBlock(i, { ...b, title })} />
              <div className="row-wrap">
                <label>개수<input type="number" min={1} max={10} value={b.count} onChange={(e) => setBlock(i, { ...b, count: Number(e.target.value) || 3 })} /></label>
                <label>모양<select value={b.style} onChange={(e) => setBlock(i, { ...b, style: e.target.value as 'cards' | 'list' })}><option value="cards">카드</option><option value="list">목록</option></select></label>
              </div>
            </>}
            {b.type === 'video' && <LangFields label="영상 주소 (YouTube·Vimeo·Google Drive)" value={b.url} langs={langs} onChange={(url) => setBlock(i, { ...b, url })} />}
            {b.type === 'download' && <>
              <AssetPick pdf label="PDF 파일" value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset })} />
              <LangFields label="단추 이름 (비우면 'PDF 내려받기')" value={b.label} langs={langs} onChange={(label) => setBlock(i, { ...b, label })} />
              <LangFields label="설명" value={b.note} langs={langs} onChange={(note) => setBlock(i, { ...b, note })} />
            </>}
            {b.type === 'story_page' && <>
              <AssetPick label="쪽 그림" value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset: asset || undefined })} />
              <LangFields label="쪽 글" value={b.text} langs={langs} multiline onChange={(text) => setBlock(i, { ...b, text })} />
            </>}
          </li>
        ))}
      </ol>
      <div className="block-add" role="group" aria-label="블록 더하기">
        {(isStory ? (['story_page', 'gallery', 'section', 'download', 'video', 'text'] as const) : (['heading', 'text', 'section', 'image', 'gallery', 'news_list', 'notice', 'video', 'download', 'inquiry'] as const)).map((t) => (
          <button key={t} type="button" className="btn btn-secondary btn-sm" onClick={() => add(t)}><Plus size={14} aria-hidden="true" />{BLOCK_LABEL[t]}</button>
        ))}
      </div>

      <div className="card site-save">
        <label>이번 판 메모 (선택)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 태국어 글 다듬음" /></label>
        {msg && <p className="banner" data-tone={msg.tone}>{msg.text}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={save} disabled={busy || !dirty}>새 판으로 저장</button>
          {canPublish && live && <button type="button" className="btn btn-ghost" onClick={() => run(() => send(`/api/site/entries/${detail.entry.id}/publish`, 'POST', { versionId: null }), '공개를 내렸습니다.')} disabled={busy}>공개 내리기</button>}
          {!canPublish && <span className="fine">공개는 학교 관리자가 합니다.</span>}
        </div>
      </div>

      <section className="card">
        <h3>판 기록</h3>
        <ol className="version-list">
          {detail.versions.map((v) => (
            <li key={v.id}>
              <span><b>{v.version}판</b> · {when(v.created_at)}{v.note ? ` · ${v.note}` : ''}{v.id === detail.liveVersionId && <> · <span className="badge" data-tone="success">공개 중</span></>}</span>
              <span className="actions">
                <Link className="btn btn-ghost btn-sm" href={`/site/preview/${detail.entry.id}?v=${v.version}`} target="_blank">미리보기</Link>
                {canPublish && v.id !== detail.liveVersionId && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => send(`/api/site/entries/${detail.entry.id}/publish`, 'POST', { versionId: v.id }), `${v.version}판을 공개했습니다.`)}>이 판 공개</button>}
              </span>
            </li>
          ))}
        </ol>
        <p className="fine">판과 공개 기록은 지우거나 고칠 수 없습니다. 예전 판으로 되돌리려면 그 판을 다시 공개하세요.</p>
      </section>
    </div>
  );
}

function SectionFields({ b, langs, assets, onUploaded, onChange }: { b: SectionBlock; langs: Lang[]; assets: Asset[]; onUploaded: (a: Asset) => void; onChange: (b: SectionBlock) => void }) {
  const items = b.items ?? [];
  const setItem = (k: number, it: SectionItem) => onChange({ ...b, items: items.map((x, j) => (j === k ? it : x)) });
  return <>
    <label>모양
      <select value={b.template} onChange={(e) => onChange({ ...b, template: e.target.value as SectionTemplate })}>
        {SECTION_TEMPLATES.map((t) => <option key={t} value={t}>{SECTION_LABEL[t]}</option>)}
      </select>
    </label>
    {/* 90차: 배치(골격) — 디자인마다 다르게 그려진다 */}
    <label>배치
      <select value={b.variant ?? ''} onChange={(e) => onChange({ ...b, variant: (e.target.value || undefined) as SectionBlock['variant'] })} data-testid="section-variant">
        <option value="">기본</option>
        {SECTION_VARIANTS.map((v) => <option key={v} value={v}>{VARIANT_LABEL[v]}</option>)}
      </select>
    </label>
    <LangFields label="머리말" value={b.eyebrow} langs={langs} onChange={(eyebrow) => onChange({ ...b, eyebrow })} />
    <LangFields label={b.template === 'quote' ? '말한 사람' : '제목'} value={b.title} langs={langs} onChange={(title) => onChange({ ...b, title })} />
    <LangFields label={b.template === 'quote' ? '문장' : '글'} value={b.body} langs={langs} multiline onChange={(body) => onChange({ ...b, body })} />
    {HAS_PHOTO.includes(b.template) && <>
      <AssetPick label="사진" value={b.asset} assets={assets} onUploaded={onUploaded} onChange={(asset) => onChange({ ...b, asset: asset || undefined })} />
      <LangFields label="사진 대체 글" value={b.alt} langs={langs} onChange={(alt) => onChange({ ...b, alt })} />
    </>}
    {HAS_ITEMS.includes(b.template) && <fieldset><legend>항목 ({items.length})</legend>
      <ol className="block-list">{items.map((it, k) => (
        <li key={k} className="block-card">
          <LangFields label={`${k + 1}. 제목`} value={it.title} langs={langs} onChange={(title) => setItem(k, { ...it, title })} />
          {b.template !== 'photos' && <LangFields label={`${k + 1}. 글`} value={it.body} langs={langs} multiline onChange={(body) => setItem(k, { ...it, body })} />}
          {['filter', 'feature-filter', 'portfolio'].includes(b.variant ?? '') && (b.template === 'cards' || b.template === 'photos') && <LangFields label={`${k + 1}. 분류(거르기 단추)`} value={it.tag} langs={langs} onChange={(tag) => setItem(k, { ...it, tag })} />}
          {(b.template === 'cards' || b.template === 'photos') && <AssetPick label={`${k + 1}. 사진`} value={it.asset} assets={assets} onUploaded={onUploaded} onChange={(asset) => setItem(k, { ...it, asset: asset || undefined })} />}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...b, items: items.filter((_, j) => j !== k) })}>{k + 1}번 항목 빼기</button>
        </li>))}</ol>
      {items.length < 12 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...b, items: [...items, {}] })}><Plus size={14} aria-hidden="true" />항목 더하기</button>}
    </fieldset>}
    {(b.template === 'cta' || b.button) && <div className="row-wrap">
      <LangFields label="단추 이름" value={b.button?.label} langs={langs} onChange={(label) => onChange({ ...b, button: { href: b.button?.href ?? '/p/contact', label } })} />
      <label>단추 링크 <span className="fine">/p/contact 또는 https://…</span><input value={b.button?.href ?? ''} onChange={(e) => onChange({ ...b, button: { label: b.button?.label ?? {}, href: e.target.value } })} /></label>
    </div>}
  </>;
}

function ProfileFields({ value, langs, assets, onUploaded, onChange }: { value: SiteProfile; langs: Lang[]; assets: Asset[]; onUploaded: (a: Asset) => void; onChange: (v: SiteProfile) => void }) {
  return (
    <section className="card site-form" data-testid="site-profile">
      <h3>사이트 머리·바닥 정보 <span className="fine">첫 화면 판과 함께 공개됩니다</span></h3>
      <AssetPick label="학교 로고" value={value.logo} assets={assets} onUploaded={onUploaded} onChange={(logo) => onChange({ ...value, logo: logo || undefined })} />
      <LangFields label="학교 소개 한 줄" value={value.tagline} langs={langs} onChange={(tagline) => onChange({ ...value, tagline })} />
      <LangFields label="주소" value={value.address} langs={langs} onChange={(address) => onChange({ ...value, address })} />
      <label>전화 <span className="fine">쉼표로 나눔, 3개까지</span><input value={(value.phone ?? []).join(', ')} onChange={(e) => onChange({ ...value, phone: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
      <label>페이스북 주소<input value={value.facebook ?? ''} onChange={(e) => onChange({ ...value, facebook: e.target.value || undefined })} placeholder="https://www.facebook.com/…" /></label>
      <LangFields label="바닥 글" value={value.footer} langs={langs} multiline onChange={(footer) => onChange({ ...value, footer })} />
    </section>
  );
}

/** 32차: 동화의 성품 이름·주인공 (학교 관리자). 판과 따로 바로 저장되며 공개 목록에도 바로 보인다. */
function StoryMeta({ id, virtue, character }: { id: string; virtue: string; character: string }) {
  const router = useRouter();
  const [v, setV] = useState({ virtue, character });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send(`/api/site/entries/${id}`, 'PATCH', v); setMsg({ tone: 'success', text: '성품 정보를 저장했습니다.' }); router.refresh(); }
    catch (x) { setMsg({ tone: 'danger', text: (x as Error).message }); }
  }
  return (
    <form className="row-wrap" onSubmit={save} data-testid="story-meta">
      <label>성품 이름<input value={v.virtue} onChange={(e) => setV({ ...v, virtue: e.target.value })} placeholder="예: 우정 · 함께함" maxLength={60} /></label>
      <label>주인공<input value={v.character} onChange={(e) => setV({ ...v, character: e.target.value })} maxLength={120} /></label>
      <div className="form-actions"><button type="submit" className="btn btn-secondary btn-sm" disabled={v.virtue === virtue && v.character === character}>성품 정보 저장</button></div>
      {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
    </form>
  );
}
