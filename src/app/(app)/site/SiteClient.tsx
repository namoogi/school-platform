'use client';
import { Field } from '@/components/Field';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileDrop, type FileDropContext } from '@/components/FileDrop';
import Link from 'next/link';
import { uploadWithProgress } from '@/lib/file-check';
import { ArrowDown, ArrowUp, Eye, FileDown, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { ANCHOR_BLOCKS, LANG_LABEL, LANGS, SECTION_TEMPLATES, SECTION_VARIANTS, type Block, type Content, type EntryKind, type Lang, type LText, type SectionItem, type SectionTemplate, type SiteProfile, type SiteSettings, type SiteTheme, SITE_THEMES } from '@/lib/site-shared';
import { usePhotoConsent, PublishCancelled } from '@/components/site/PhotoConsent';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';

// 값 → 이름표: 이름표에는 '-'를 쓰지 않으므로 '_'로 바꾼다(media-left → site.section.media_left)
const labelKey = (area: string, value: string) => `site.${area}.${value.replace(/-/g, '_')}` as MsgKey;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '');
  return data;
}

/** 목록에서 저장된 최신 판을 공개한다. 편집기에서 아직 저장하지 않은 글은 포함하지 않는다. */
export function EntryPublishControl({ id, title, latestVersion, liveVersion }: { id: string; title: string; latestVersion: number; liveVersion: number | null }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [askConsent, consentDialog] = usePhotoConsent();
  async function change(publish: boolean) {
    setBusy(true); setMsg(null);
    try {
      // 122차: 공개할 때 사진이 있으면 공개 창에서 사진 공개 허가 확인
      const consent = publish ? await askConsent([{ entryId: id }]) : {};
      if (!consent) { setMsg({ tone: 'success', text: t('site.consent.cancelled') }); return; }
      await send(`/api/site/entries/${id}/publish`, 'POST', publish ? consent : { versionId: null });
      setMsg({ tone: 'success', text: publish ? t('site.entry.publishedLatest') : t('site.entry.unpublishedMsg') });
      startTransition(() => router.refresh());
    } catch (err) { setMsg({ tone: 'danger', text: (err as Error).message || t('common.saveFailed') }); }
    finally { setBusy(false); }
  }
  return <div className="site-list-publish" data-testid="entry-publish-control" role="group" aria-label={t('site.entry.publishGroup', { title })}>
    {consentDialog}
    <div className="row-wrap">
      {liveVersion !== latestVersion && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || refreshing} onClick={() => change(true)} title={t('site.entry.publishLatestHint')}>{liveVersion === null ? t('site.entry.publish') : t('site.entry.publishNew')}</button>}
      {liveVersion !== null && <button type="button" className="btn btn-ghost btn-sm" disabled={busy || refreshing} onClick={() => change(false)}>{t('site.entry.unpublish')}</button>}
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
  const { t } = useI18n();
  const [s, setS] = useState({
    public_slug: initial?.public_slug ?? '', langs: (initial?.langs ?? ['ko']) as Lang[], default_lang: (initial?.default_lang ?? 'ko') as Lang,
    theme: initial?.theme ?? 'campus', site_title: (initial?.site_title ?? { ko: schoolName }) as LText, is_open: initial?.is_open ?? false, inquiry_open: initial?.inquiry_open ?? false,
  });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(saved ? { tone: 'success', text: t('common.saved') } : null);
  // 표시를 넘겨받았으면 주소에서 saved=1을 지운다(새로 고침·즐겨찾기로 다시 열 때 저장한 것처럼 보이지 않게). 서버를 다시 부르지 않는다
  useEffect(() => {
    if (!saved) return;
    const u = new URL(window.location.href);
    u.searchParams.delete('saved');
    window.history.replaceState(window.history.state, '', u.pathname + u.search);
  }, [saved]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await send('/api/site/settings', 'POST', s); setMsg({ tone: 'success', text: t('common.saved') }); router.replace('/site?box=settings&saved=1', { scroll: false }); router.refresh(); }
    catch (err) { setMsg({ tone: 'danger', text: (err as Error).message || t('common.saveFailed') }); }
  }
  const toggleLang = (l: Lang) => setS((x) => {
    const langs = x.langs.includes(l) ? x.langs.filter((y) => y !== l) : [...x.langs, l];
    return { ...x, langs, default_lang: langs.includes(x.default_lang) ? x.default_lang : (langs[0] ?? 'ko') };
  });
  return (
    <form className="card site-form" onSubmit={save} data-testid="site-settings">
      <h2>{t('site.settings.title')}</h2>
      <Field label={t('site.settings.slug')} required hint={<>onschools.vercel.app/s/<b>{s.public_slug || t('site.settings.slugPlaceholder')}</b></>}>
        <input value={s.public_slug} onChange={(e) => setS({ ...s, public_slug: e.target.value })} placeholder={t('site.settings.slugExample')} />
      </Field>
      <fieldset><legend>{t('site.settings.langs')}</legend>
        <div className="row-wrap">{LANGS.map((l) => (
          <label key={l} className="radio"><input type="checkbox" checked={s.langs.includes(l)} onChange={() => toggleLang(l)} /> {LANG_LABEL[l]}</label>))}</div>
      </fieldset>
      <label>{t('site.settings.defaultLang')}
        <select value={s.default_lang} onChange={(e) => setS({ ...s, default_lang: e.target.value as Lang })}>
          {s.langs.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
        </select>
      </label>
      {s.langs.map((l) => (
        <label key={l}>{t('site.settings.siteTitle', { lang: LANG_LABEL[l] })}
          <input value={s.site_title[l] ?? ''} onChange={(e) => setS({ ...s, site_title: { ...s.site_title, [l]: e.target.value } })} />
        </label>
      ))}
      <label>{t('site.settings.theme')}
        <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value as SiteTheme })} data-testid="site-theme">
          {SITE_THEMES.map((x) => <option key={x.key} value={x.key}>{t(labelKey('theme', x.key))} — {t(labelKey('themeNote', x.key))}</option>)}
        </select>
      </label>
      <label className="radio"><input type="checkbox" checked={s.is_open} onChange={(e) => setS({ ...s, is_open: e.target.checked })} /> {t('site.settings.isOpen')}</label>
      {/* 91차(ADR 0036): 방문·상담 신청 — 쪽에 '방문·상담 신청' 블록을 넣고 이것을 켜면 방문자가 신청을 남긴다 */}
      <label className="radio"><input type="checkbox" checked={s.inquiry_open} onChange={(e) => setS({ ...s, inquiry_open: e.target.checked })} data-testid="site-inquiry-open" /> {t('site.settings.inquiryOpen')}</label>
      {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary">{t('site.settings.save')}</button></div>
    </form>
  );
}

// ── 새 항목 ──────────────────────────────────────────────
export function NewEntryForm({ kind, disabled, initialOpen = false }: { kind: EntryKind; disabled: boolean; initialOpen?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [f, setF] = useState({ key: '', title: '', virtue: '', character: '' });
  const [err, setErr] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const r = await send('/api/site/entries', 'POST', { kind, key: f.key, virtue: f.virtue, character: f.character, content: { title: { ko: f.title }, blocks: [] } });
      setOpen(false); setF({ key: '', title: '', virtue: '', character: '' });
      router.push(`/site?box=${kind}&id=${r.id}`); router.refresh();
    } catch (x) { setErr((x as Error).message || t('common.saveFailed')); }
  }
  if (!open) return <div className="site-new"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={disabled} data-testid="new-entry"><Plus size={16} aria-hidden="true" />{t(labelKey('new', kind))}</button></div>;
  return (
    <form className="site-new site-form" onSubmit={create}>
      <Field label={t('site.field.title')} required><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label={t('site.settings.slug')} required hint={<>{t('site.entry.keyHint')}{kind === 'page' ? t('site.entry.keyHintHome') : ''}</>}>
        <input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder={kind === 'story' ? 'what-rain-cannot-erase' : kind === 'page' ? 'about' : 'open-day'} /></Field>
      {kind === 'story' && <>
        <label>{t('site.story.virtue')}<input value={f.virtue} onChange={(e) => setF({ ...f, virtue: e.target.value })} placeholder={t('site.story.virtueExample')} /></label>
        <label>{t('site.story.character')}<input value={f.character} onChange={(e) => setF({ ...f, character: e.target.value })} /></label>
      </>}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary btn-sm">{t('site.entry.createDraft')}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('common.cancel')}</button></div>
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
  subpages: () => ({ type: 'subpages' }),
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
const when = (d: string, locale: string) => new Date(d).toLocaleString(locale, { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

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
  const { t } = useI18n();
  async function upload([file]: File[], { signal, progress }: FileDropContext) {
    const form = new FormData(); form.append('file', file);
    const res = await uploadWithProgress('/api/site/assets', form, { signal, onProgress: progress });
    const data = res.body as { id?: string; error?: string };
    if (!res.ok || !data.id) throw new Error(data.error ?? t('site.asset.uploadFailed'));
    onUploaded({ id: data.id, name: file.name, mime: file.type }); onChange(data.id);
    return t('site.asset.uploaded', { name: file.name });
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
            <option value="">{t('site.asset.none')}</option>
            {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <FileDrop
          compact label={pdf ? t('site.asset.uploadPdf') : t('site.asset.uploadImage')} onFiles={upload}
          accept={pdf ? ['application/pdf', '.pdf'] : languageImage ? ['image/png', 'image/jpeg', 'image/webp'] : ['image/png', 'image/jpeg', 'image/webp', 'image/gif']}
          typeLabel={pdf ? 'PDF' : languageImage ? 'PNG·JPG·WEBP' : 'PNG·JPG·WEBP·GIF'} maxSize={(pdf ? 4 : 5) * 1024 * 1024}
          hint={pdf ? t('site.asset.pdfHint') : <span data-testid="photo-consent">{t('site.asset.photoConsent')}</span>}
        />
      </div>
    </div>
  );
}

export function EntryEditor({ detail, langs, canPublish, assets: initialAssets, publicHref, menuParents = [] }: {
  detail: Detail; langs: Lang[]; canPublish: boolean; assets: Asset[]; publicHref: string | null;
  /** 126차(ADR 0046): 상위 메뉴로 고를 수 있는 쪽(이 쪽·홈 제외) */ menuParents?: { key: string; title: string }[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
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
  const add = (type: Block['type']) => setContent((c) => ({ ...c, blocks: [...c.blocks, NEW_BLOCK[type]()] }));
  const uploaded = (a: Asset) => setAssets((xs) => (xs.some((x) => x.id === a.id) ? xs : [a, ...xs]));

  const [askConsent, consentDialog] = usePhotoConsent();
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); router.refresh(); }
    catch (e) {
      if (e instanceof PublishCancelled) { setMsg({ tone: 'success', text: t('site.consent.cancelled') }); router.refresh(); return; }
      setMsg({ tone: 'danger', text: (e as Error).message || t('common.saveFailed') });
    }
    finally { setBusy(false); }
  }
  /** 122차: 공개 창(사진 공개 허가 확인)을 거쳐 공개한다. versionId 가 없으면 최신 판 */
  const publishVersion = async (versionId?: string) => {
    const consent = await askConsent([{ entryId: detail.entry.id, versionId }]);
    if (!consent) throw new PublishCancelled();
    await send(`/api/site/entries/${detail.entry.id}/publish`, 'POST', versionId ? { versionId, ...consent } : consent);
  };
  const save = () => run(() => { setSent(norm(content)); return send(`/api/site/entries/${detail.entry.id}/versions`, 'POST', { content, note }); }, t('site.entry.savedVersion'));
  const publishLatest = () => run(async () => {
    if (dirty) { setSent(norm(content)); await send(`/api/site/entries/${detail.entry.id}/versions`, 'POST', { content, note }); }
    await publishVersion();
  }, t('site.entry.published'));

  return (
    <div className="site-editor" data-testid="entry-editor">
      {consentDialog}
      <div className="card">
        <div className="between site-editor-header">
          <div>
            <p className="fine">{t(labelKey('kind', detail.entry.kind))} · /{detail.entry.key} · {t('site.entry.latestVersion', { v: latest.version })} · {live ? t('site.entry.liveVersion', { v: live.version }) : t('site.entry.notLive')}</p>
            <div className="site-editor-title">
              <h2>{content.title[langs[0]] || content.title.ko || detail.entry.key}</h2>
              {canPublish && <button type="button" className="btn btn-primary btn-sm" onClick={publishLatest} disabled={busy || (!dirty && live?.id === latest.id)}>{dirty ? t('site.entry.saveAndPublish') : t('site.entry.publishLatest')}</button>}
            </div>
          </div>
          <div className="actions">
            <Link className="btn btn-ghost btn-sm" href={`/site/preview/${detail.entry.id}`} target="_blank"><Eye size={16} aria-hidden="true" />{t('site.entry.previewDraft')}</Link>
            {publicHref && live && <Link className="btn btn-ghost btn-sm" href={publicHref} target="_blank">{t('site.entry.viewPublic')}</Link>}
          </div>
        </div>
        {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
        {isStory && (canPublish
          ? <StoryMeta id={detail.entry.id} virtue={detail.entry.meta.virtue ?? ''} character={detail.entry.meta.character ?? ''} />
          : detail.entry.meta.virtue && <p className="fine">{t('site.story.virtueLine', { virtue: detail.entry.meta.virtue })}{detail.entry.meta.character ? ` · ${t('site.story.characterLine', { character: detail.entry.meta.character })}` : ''}</p>)}
        <LangFields label={t('site.field.title')} value={content.title} langs={langs} onChange={(title) => setContent({ ...content, title })} />
        <LangFields label={t('site.field.summary')} value={content.summary} langs={langs} multiline onChange={(summary) => setContent({ ...content, summary })} />
        <AssetPick label={t('site.field.cover')} value={content.cover} assets={assets} onUploaded={uploaded} onChange={(cover) => setContent({ ...content, cover: cover || undefined })} />
        {detail.entry.kind === 'page' && detail.entry.key !== 'home' && (
          <label>{t('site.menu.parent')}
            <select value={content.menu?.parent ?? ''} data-testid="menu-parent"
              onChange={(e) => setContent({ ...content, menu: e.target.value ? { parent: e.target.value } : undefined })}>
              <option value="">{t('site.menu.parentNone')}</option>
              {menuParents.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
              <option value="news">{t('site.menu.parentNews')}</option>
            </select>
          </label>
        )}
      </div>
      {detail.entry.kind === 'page' && detail.entry.key === 'home' && (
        <ProfileFields value={content.site ?? {}} langs={langs} assets={assets} onUploaded={uploaded} onChange={(site) => setContent({ ...content, site })} />
      )}

      <ol className="block-list">
        {content.blocks.map((b, i) => (
          <li key={i} className="card block-card" data-block={b.type}>
            <div className="between">
              <strong>{i + 1}. {t(labelKey('block', b.type))}</strong>
              <div className="actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('site.block.moveUp', { n: i + 1 })}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === content.blocks.length - 1} aria-label={t('site.block.moveDown', { n: i + 1 })}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} aria-label={t('site.block.remove', { n: i + 1 })}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </div>
            {(b.type === 'heading' || b.type === 'notice') && <LangFields label={t('site.field.text')} value={b.text} langs={langs} onChange={(text) => setBlock(i, { ...b, text })} />}
            {(b.type === 'image' || b.type === 'story_page') && <details className="site-language-images">
              <summary>{t('site.block.langImages')}</summary>
              <p className="fine">{t('site.block.langImagesLead')}</p>
              {LANGS.map((lang) => <AssetPick key={lang} languageImage label={t('site.block.langImage', { lang: LANG_LABEL[lang] })} value={b.images?.[lang]?.asset} assets={assets} onUploaded={uploaded}
                onChange={(asset) => { const images = { ...b.images }; if (asset) images[lang] = { asset }; else delete images[lang]; setBlock(i, { ...b, images }); }} />)}
            </details>}
            {b.type === 'text' && <LangFields label={t('site.field.text')} value={b.text} langs={langs} multiline onChange={(text) => setBlock(i, { ...b, text })} />}
            {b.type === 'image' && <>
              <AssetPick label={t('site.field.image')} value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset })} />
              <LangFields label={t('site.field.alt')} value={b.alt} langs={langs} onChange={(alt) => setBlock(i, { ...b, alt })} />
            </>}
            {b.type === 'gallery' && <>
              <label><input type="checkbox" checked={b.download === 'png'} onChange={(e) => setBlock(i, { ...b, download: e.target.checked ? 'png' : undefined, scene: e.target.checked ? b.scene ?? 1 : undefined })} />{t('site.gallery.png')}</label>
              {b.download === 'png' && <label>{t('site.gallery.scene')}<input type="number" min={1} max={200} value={b.scene ?? 1} onChange={(e) => setBlock(i, { ...b, scene: Number(e.target.value) })} /></label>}
              <LangFields label={t('site.gallery.caption')} value={b.caption} langs={langs} onChange={(caption) => setBlock(i, { ...b, caption })} />
              {b.download === 'png' && (b.items ?? b.assets.map((asset) => ({ asset, alt: {} as LText }))).map((item, k) => <LangFields key={k} label={t('site.gallery.charAlt', { n: k + 1 })} value={item.alt} langs={langs} onChange={(alt) => setBlock(i, { ...b, items: (b.items ?? b.assets.map((asset) => ({ asset, alt: {} as LText }))).map((it, j) => j === k ? { ...it, alt } : it) })} />)}
              <div className="gallery-pick">{b.assets.map((a, k) => (
                <span key={a + k}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/site/assets/${a}`} alt="" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlock(i, { ...b, assets: b.assets.filter((_, j) => j !== k), items: b.items?.filter((_, j) => j !== k) })}>{t('site.field.remove')}</button></span>))}</div>
              <AssetPick label={t('site.gallery.addPhoto')} assets={assets} onUploaded={uploaded} onChange={(a) => a && setBlock(i, { ...b, assets: [...b.assets, a], items: b.items ? [...b.items, { asset: a }] : undefined })} />
            </>}
            {b.type === 'gallery' && b.items && <p className="fine">{t('site.gallery.itemsNote', { n: b.items.length, filters: b.filters ? t('site.gallery.filters', { n: b.filters.length }) : '' })}</p>}
            {b.type === 'section' && <SectionFields b={b} langs={langs} assets={assets} onUploaded={uploaded} onChange={(nb) => setBlock(i, nb)} />}
            {detail.entry.kind === 'page' && (ANCHOR_BLOCKS as readonly string[]).includes(b.type) && (
              <label>{t('site.menu.anchor')}
                <input value={b.anchor ?? ''} maxLength={40} pattern="[a-z][a-z0-9\-]*" data-testid="block-anchor" aria-describedby={`anchor-hint-${i}`}
                  onChange={(e) => setBlock(i, { ...b, anchor: e.target.value.trim().toLowerCase() || undefined })} />
                <span className="fine" id={`anchor-hint-${i}`}>{t('site.menu.anchorHint')}</span>
              </label>
            )}
            {b.type === 'inquiry' && <>
              <LangFields label={t('site.inqBlock.title')} value={b.title} langs={langs} onChange={(title) => setBlock(i, { ...b, title })} />
              <LangFields label={t('site.inqBlock.body')} value={b.body} langs={langs} multiline onChange={(body) => setBlock(i, { ...b, body })} />
              <p className="fine">{t('site.inqBlock.note')}</p>
            </>}
            {b.type === 'news_list' && <>
              <LangFields label={t('site.field.title')} value={b.title} langs={langs} onChange={(title) => setBlock(i, { ...b, title })} />
              <div className="row-wrap">
                <label>{t('site.news.count')}<input type="number" min={1} max={10} value={b.count} onChange={(e) => setBlock(i, { ...b, count: Number(e.target.value) || 3 })} /></label>
                <label>{t('site.field.style')}<select value={b.style} onChange={(e) => setBlock(i, { ...b, style: e.target.value as 'cards' | 'list' })}><option value="cards">{t('site.news.cards')}</option><option value="list">{t('site.news.list')}</option></select></label>
              </div>
            </>}
            {b.type === 'video' && <LangFields label={t('site.video.url')} value={b.url} langs={langs} onChange={(url) => setBlock(i, { ...b, url })} />}
            {b.type === 'download' && <>
              <AssetPick pdf label={t('site.download.file')} value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset })} />
              <LangFields label={t('site.download.label')} value={b.label} langs={langs} onChange={(label) => setBlock(i, { ...b, label })} />
              <LangFields label={t('site.field.note')} value={b.note} langs={langs} onChange={(note) => setBlock(i, { ...b, note })} />
            </>}
            {b.type === 'story_page' && <>
              <AssetPick label={t('site.storyPage.image')} value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset: asset || undefined })} />
              <LangFields label={t('site.storyPage.text')} value={b.text} langs={langs} multiline onChange={(text) => setBlock(i, { ...b, text })} />
            </>}
          </li>
        ))}
      </ol>
      <div className="block-add" role="group" aria-label={t('site.block.addGroup')}>
        {(isStory ? (['story_page', 'gallery', 'section', 'download', 'video', 'text'] as const) : (['heading', 'text', 'section', 'image', 'gallery', 'news_list', 'notice', 'video', 'download', 'inquiry'] as const)).map((type) => (
          <button key={type} type="button" className="btn btn-secondary btn-sm" onClick={() => add(type)}><Plus size={14} aria-hidden="true" />{t(labelKey('block', type))}</button>
        ))}
      </div>

      <div className="card site-save">
        <label>{t('site.entry.note')}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('site.entry.noteExample')} /></label>
        {msg && <p className="banner" data-tone={msg.tone}>{msg.text}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={save} disabled={busy || !dirty}>{t('site.entry.saveVersion')}</button>
          {canPublish && live && <button type="button" className="btn btn-ghost" onClick={() => run(() => send(`/api/site/entries/${detail.entry.id}/publish`, 'POST', { versionId: null }), t('site.entry.unpublished'))} disabled={busy}>{t('site.entry.unpublishBtn')}</button>}
          {!canPublish && <span className="fine">{t('site.entry.adminPublishes')}</span>}
        </div>
      </div>

      <section className="card">
        <h3>{t('site.entry.history')}</h3>
        <ol className="version-list">
          {detail.versions.map((v) => (
            <li key={v.id}>
              <span><b>{t('common.version', { v: v.version })}</b> · {when(v.created_at, locale)}{v.note ? ` · ${v.note}` : ''}{v.id === detail.liveVersionId && <> · <span className="badge" data-tone="success">{t('site.status.live')}</span></>}</span>
              <span className="actions">
                <Link className="btn btn-ghost btn-sm" href={`/site/preview/${detail.entry.id}?v=${v.version}`} target="_blank">{t('site.entry.preview')}</Link>
                {canPublish && v.id !== detail.liveVersionId && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => publishVersion(v.id), t('site.entry.publishedVersion', { v: v.version }))}>{t('site.entry.publishThis')}</button>}
              </span>
            </li>
          ))}
        </ol>
        <p className="fine">{t('site.entry.historyNote')}</p>
      </section>
    </div>
  );
}

function SectionFields({ b, langs, assets, onUploaded, onChange }: { b: SectionBlock; langs: Lang[]; assets: Asset[]; onUploaded: (a: Asset) => void; onChange: (b: SectionBlock) => void }) {
  const { t } = useI18n();
  const items = b.items ?? [];
  const setItem = (k: number, it: SectionItem) => onChange({ ...b, items: items.map((x, j) => (j === k ? it : x)) });
  return <>
    <label>{t('site.field.style')}
      <select value={b.template} onChange={(e) => onChange({ ...b, template: e.target.value as SectionTemplate })}>
        {SECTION_TEMPLATES.map((tpl) => <option key={tpl} value={tpl}>{t(labelKey('section', tpl))}</option>)}
      </select>
    </label>
    {/* 90차: 배치(골격) — 디자인마다 다르게 그려진다 */}
    <label>{t('site.section.variant')}
      <select value={b.variant ?? ''} onChange={(e) => onChange({ ...b, variant: (e.target.value || undefined) as SectionBlock['variant'] })} data-testid="section-variant">
        <option value="">{t('site.section.variantDefault')}</option>
        {SECTION_VARIANTS.map((v) => <option key={v} value={v}>{t(labelKey('variant', v))}</option>)}
      </select>
    </label>
    <LangFields label={t('site.section.eyebrow')} value={b.eyebrow} langs={langs} onChange={(eyebrow) => onChange({ ...b, eyebrow })} />
    <LangFields label={b.template === 'quote' ? t('site.section.quoteBy') : t('site.field.title')} value={b.title} langs={langs} onChange={(title) => onChange({ ...b, title })} />
    <LangFields label={b.template === 'quote' ? t('site.section.quoteText') : t('site.field.text')} value={b.body} langs={langs} multiline onChange={(body) => onChange({ ...b, body })} />
    {HAS_PHOTO.includes(b.template) && <>
      <AssetPick label={t('site.field.photo')} value={b.asset} assets={assets} onUploaded={onUploaded} onChange={(asset) => onChange({ ...b, asset: asset || undefined })} />
      <LangFields label={t('site.section.photoAlt')} value={b.alt} langs={langs} onChange={(alt) => onChange({ ...b, alt })} />
    </>}
    {HAS_ITEMS.includes(b.template) && <fieldset><legend>{t('site.section.items', { n: items.length })}</legend>
      <ol className="block-list">{items.map((it, k) => (
        <li key={k} className="block-card">
          <LangFields label={`${k + 1}. ${t('site.field.title')}`} value={it.title} langs={langs} onChange={(title) => setItem(k, { ...it, title })} />
          {b.template !== 'photos' && <LangFields label={`${k + 1}. ${t('site.field.text')}`} value={it.body} langs={langs} multiline onChange={(body) => setItem(k, { ...it, body })} />}
          {['filter', 'feature-filter', 'portfolio', 'events'].includes(b.variant ?? '') && (b.template === 'cards' || b.template === 'photos') && <LangFields label={`${k + 1}. ${t(b.variant === 'events' ? 'site.section.eventDate' : 'site.section.tag')}`} value={it.tag} langs={langs} onChange={(tag) => setItem(k, { ...it, tag })} />}
          {(b.template === 'cards' || b.template === 'photos') && <AssetPick label={`${k + 1}. ${t('site.field.photo')}`} value={it.asset} assets={assets} onUploaded={onUploaded} onChange={(asset) => setItem(k, { ...it, asset: asset || undefined })} />}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...b, items: items.filter((_, j) => j !== k) })}>{t('site.section.removeItem', { n: k + 1 })}</button>
        </li>))}</ol>
      {items.length < 12 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange({ ...b, items: [...items, {}] })}><Plus size={14} aria-hidden="true" />{t('site.section.addItem')}</button>}
    </fieldset>}
    {(b.template === 'cta' || b.button) && <div className="row-wrap">
      <LangFields label={t('site.section.buttonLabel')} value={b.button?.label} langs={langs} onChange={(label) => onChange({ ...b, button: { href: b.button?.href ?? '/p/contact', label } })} />
      <label>{t('site.section.buttonHref')} <span className="fine">{t('site.section.buttonHrefHint')}</span><input value={b.button?.href ?? ''} onChange={(e) => onChange({ ...b, button: { label: b.button?.label ?? {}, href: e.target.value } })} /></label>
    </div>}
  </>;
}

function ProfileFields({ value, langs, assets, onUploaded, onChange }: { value: SiteProfile; langs: Lang[]; assets: Asset[]; onUploaded: (a: Asset) => void; onChange: (v: SiteProfile) => void }) {
  const { t } = useI18n();
  return (
    <section className="card site-form" data-testid="site-profile">
      <h3>{t('site.profile.title')} <span className="fine">{t('site.profile.titleNote')}</span></h3>
      <AssetPick label={t('site.profile.logo')} value={value.logo} assets={assets} onUploaded={onUploaded} onChange={(logo) => onChange({ ...value, logo: logo || undefined })} />
      <LangFields label={t('site.profile.tagline')} value={value.tagline} langs={langs} onChange={(tagline) => onChange({ ...value, tagline })} />
      <LangFields label={t('site.profile.address')} value={value.address} langs={langs} onChange={(address) => onChange({ ...value, address })} />
      <label>{t('site.profile.phone')} <span className="fine">{t('site.profile.phoneHint')}</span><input value={(value.phone ?? []).join(', ')} onChange={(e) => onChange({ ...value, phone: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
      <label>{t('site.profile.facebook')}<input value={value.facebook ?? ''} onChange={(e) => onChange({ ...value, facebook: e.target.value || undefined })} placeholder="https://www.facebook.com/…" /></label>
      <LangFields label={t('site.profile.footer')} value={value.footer} langs={langs} multiline onChange={(footer) => onChange({ ...value, footer })} />
      {/* 136차(ADR 0052): 메뉴 구조 — 위 메뉴(기본)·옆 메뉴·한 쪽 스크롤. 학사 기본·새벽빛 디자인에는 적용되지 않는다 */}
      <label>{t('site.facet.nav')} <span className="fine">{t('site.profile.layoutHint')}</span>
        <select value={value.layout ?? 'top'} data-testid="site-layout" onChange={(e) => onChange({ ...value, layout: e.target.value === 'top' ? undefined : (e.target.value as 'side' | 'onepage') })}>
          {(['top', 'side', 'onepage'] as const).map((v) => <option key={v} value={v}>{t(`site.facet.nav.${v}`)} — {t(`site.facet.nav.${v}.note`)}</option>)}
        </select>
      </label>
    </section>
  );
}

/** 32차: 동화의 성품 이름·주인공 (학교 관리자). 판과 따로 바로 저장되며 공개 목록에도 바로 보인다. */
function StoryMeta({ id, virtue, character }: { id: string; virtue: string; character: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [v, setV] = useState({ virtue, character });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send(`/api/site/entries/${id}`, 'PATCH', v); setMsg({ tone: 'success', text: t('site.story.saved') }); router.refresh(); }
    catch (x) { setMsg({ tone: 'danger', text: (x as Error).message || t('common.saveFailed') }); }
  }
  return (
    <form className="row-wrap" onSubmit={save} data-testid="story-meta">
      <label>{t('site.story.virtueName')}<input value={v.virtue} onChange={(e) => setV({ ...v, virtue: e.target.value })} placeholder={t('site.story.virtueNameExample')} maxLength={60} /></label>
      <label>{t('site.story.hero')}<input value={v.character} onChange={(e) => setV({ ...v, character: e.target.value })} maxLength={120} /></label>
      <div className="form-actions"><button type="submit" className="btn btn-secondary btn-sm" disabled={v.virtue === virtue && v.character === character}>{t('site.story.save')}</button></div>
      {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
    </form>
  );
}
