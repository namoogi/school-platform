'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, GripVertical, ImagePlus, LayoutTemplate, Plus, Settings2, Trash2, Undo2, X,
} from 'lucide-react';
import {
  KIND_LABEL, LANG_LABEL, PHOTO_CONSENT, SECTION_LABEL, SECTION_TEMPLATES, pick, type Block, type Content, type EntryKind, type Lang, type LText,
  type SectionTemplate, type SiteProfile,
} from '@/lib/site-shared';
import type { PublicSite } from '@/lib/site';
import {
  blockName, blockSnippet, featurePalette, getAt, insertBlock, LAYOUT_PALETTE, moveBlock, removeBlock, sameContent, setAt, setLangText,
  toggleHidden, translationState, clean, type EditPath, type PaletteItem,
} from '@/lib/site-edit';
import { PageHead, SiteBlocks, type EditHooks, type NewsItem } from '@/components/site/SiteRenderer';
import { SiteFrame } from '@/components/site/SiteFrame';
import { FileDrop, type FileDropContext } from '@/components/FileDrop';
import { uploadWithProgress } from '@/lib/file-check';
import { blockLabel, fieldLabel, paletteText, siteLabel } from '@/lib/site-labels';
import { useI18n } from '@/components/I18nProvider';
import { withLink } from '@/components/ui';

type Version = { id: string; version: number; content: Content; note: string | null; created_at: string };
type Detail = {
  entry: { id: string; kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; meta: Record<string, unknown> };
  versions: Version[]; publications: { id: number; version_id: string | null; published_at: string }[]; liveVersionId: string | null;
};
type Asset = { id: string; name: string };
type Picker =
  | { mode: 'set'; path: EditPath; altPath?: EditPath; optional?: boolean; label: string }
  | { mode: 'insert'; item: PaletteItem; at: number }
  | { mode: 'gallery'; i: number };
type Msg = { tone: 'success' | 'danger' | 'info'; text: string; undo?: boolean };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? ''), { status: res.status });
  return data;
}
const norm = (c: Content) => JSON.stringify(clean(c));
const assetUrl = (a: string) => `/site/assets/${a}`;
const HAS_ITEMS: SectionTemplate[] = ['cards', 'photos', 'facts', 'steps'];

/**
 * 35차 화면 편집 (ADR 0011 1단계)
 * - 편집 모드: 글은 그 자리에서(언어별), 사진은 눌러서 사진함에서, 구역은 막대·레이아웃 가이드로 옮기기·숨기기·지우기·끼워 넣기
 * - 바뀐 내용은 기존 판 저장 API로 새 판(시안)이 된다. 공개는 학교 관리자만(서버 RLS가 다시 막는다).
 * - 편집 모드를 끄면 방문자에게 보일 모습(숨긴 구역 빠짐)을 같은 그리기로 본다.
 */
export function LiveEditor({ detail, frame, langs, defaultLang, canPublish, assets: initialAssets, news, profile, siteOpen, backHref, pages = [] }: {
  /** 48차: 공개 화면에서 왔으면 돌아갈 주소 */ backHref?: string | null;
  /** 53차: 관리 화면 안에서 다른 쪽으로 바로 옮겨 고친다 */ pages?: { id: string; kind: EntryKind; key: string; title: string }[];
  detail: Detail; frame: PublicSite; langs: Lang[]; defaultLang: Lang; canPublish: boolean; assets: Asset[]; news: NewsItem[];
  profile: SiteProfile | null; siteOpen: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { entry } = detail;
  const latest = detail.versions[0];
  const live = detail.versions.find((v) => v.id === detail.liveVersionId);
  const base = (live ?? latest).content; // 번역 표시 기준: 공개 중인 판(없으면 최신 판)

  const [content, setContent] = useState<Content>(() => structuredClone(latest.content));
  const cref = useRef(content);
  const [past, setPast] = useState<Content[]>([]);
  const [editing, setEditing] = useState(true);
  const [lang, setLang] = useState<Lang>(defaultLang);
  const [sel, setSel] = useState<number | null>(null); // 고른 구역 (-1 = 쪽 머리)
  const [settingsOf, setSettingsOf] = useState<number | null>(null);
  const [guide, setGuide] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [assets, setAssets] = useState(initialAssets);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const [focusGrip, setFocusGrip] = useState<number | null>(null);
  const armed = useRef(false);

  // 새 판이 오면(저장·공개 뒤 새로 고침, 또는 다른 사람·외부 작업 토큰이 만든 판):
  // - 방금 내가 보낸 내용이면 입력을 그대로 둔다.
  // - 내가 저장하지 않은 고침이 있으면 지우지 않고 '다른 판이 생김'을 알린다(ADR 0013 병행 규칙: 덮어쓰지도, 버리지도 않는다).
  // - 고친 것이 없으면 새 판으로 맞춘다.
  const [shown, setShown] = useState({ id: latest.id, content: latest.content });
  const [sent, setSent] = useState<string | null>(null);
  const [conflict, setConflict] = useState<number | null>(null); // 내 고침과 따로 생긴 최신 판 번호
  if (shown.id !== latest.id) {
    const mine = sent !== null && sent === norm(latest.content);
    const unsaved = !sameContent(cref.current, shown.content);
    setShown({ id: latest.id, content: latest.content });
    if (mine) setConflict(null);
    else if (unsaved) setConflict(latest.version);
    else { const c = structuredClone(latest.content); setContent(c); cref.current = c; setPast([]); setConflict(null); }
    setSent(null); if (mine) setNote('');
  }
  const dirty = !sameContent(content, latest.content);
  const isHome = entry.kind === 'page' && entry.key === 'home';
  const kind = entry.kind;

  /** 내용 바꾸기. record=true 면 되돌리기 기록에 남긴다 */
  const change = useCallback((fn: (c: Content) => Content, record = true) => {
    const c = cref.current;
    const n = fn(c);
    if (n === c) return;
    if (record) setPast((p) => [...p.slice(-49), c]);
    cref.current = n;
    setContent(n);
  }, []);
  /** 글 칸: 칸에 들어간 뒤 첫 입력만 되돌리기 기록에 남긴다(글자마다 쌓지 않음) */
  const arm = useCallback(() => { armed.current = true; }, []);
  const typed = useCallback((fn: (c: Content) => Content) => { const r = armed.current; armed.current = false; change(fn, r); }, [change]);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      cref.current = prev; setContent(prev);
      return p.slice(0, -1);
    });
    setMsg(null);
  }, []);

  // base_version: 이 화면을 연 뒤 다른 사람(또는 외부 작업 토큰)이 새 판을 저장했으면 서버가 409로 막는다(ADR 0013 병행 규칙).
  // 그때는 내 고침을 덮어쓰지 않고, 새로 불러온 뒤 다시 고치도록 안내한다.
  const baseRef = useRef(latest.version);
  if (latest.version > baseRef.current) baseRef.current = latest.version;
  const saveVersion = async () => {
    setSent(norm(cref.current));
    const v = await send(`/api/site/entries/${entry.id}/versions`, 'POST', { content: cref.current, note, base_version: baseRef.current });
    if (typeof v?.version === 'number') baseRef.current = v.version; // 새로 고침 전에 한 번 더 저장해도 내 판을 기준으로
  };
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'success', text: ok }); router.refresh(); }
    catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
        // 그 사이 새 판이 생김: 내 고침은 화면에 둔 채 최신 판을 다시 읽는다(위의 새 판 처리에서 '다른 판이 생김'으로 바뀜)
        setSent(null); setConflict((c) => c ?? -1); router.refresh();
        setMsg({ tone: 'danger', text: t('site.edit.conflict409') });
      } else setMsg({ tone: 'danger', text: err.message || t('common.saveFailed') });
    }
    finally { setBusy(false); }
  }
  const saveDraft = () => run(saveVersion, t('site.edit.savedDraft'));
  const publish = () => run(async () => {
    if (dirty) await saveVersion();
    await send(`/api/site/entries/${entry.id}/publish`, 'POST', {});
  }, t('site.edit.published'));

  // 단축키: Ctrl+S 시안 저장, Ctrl+Z 되돌리기(글 칸 밖에서 — 글 칸 안에서는 브라우저의 되돌리기)
  const keys = useRef({ saveDraft, undo, dirty, busy });
  keys.current = { saveDraft, undo, dirty, busy };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); if (keys.current.dirty && !keys.current.busy) keys.current.saveDraft(); }
      if (k === 'z' && !e.shiftKey) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
        e.preventDefault(); keys.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 저장하지 않고 나가려 하면 묻는다
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);
  // 키보드로 구역을 옮긴 뒤 그 구역의 손잡이에 초점을 둔다
  useEffect(() => {
    if (focusGrip == null) return;
    document.querySelector<HTMLElement>(`[data-grip="${focusGrip}"]`)?.focus();
    setFocusGrip(null);
  }, [focusGrip, content]);

  const move = (from: number, to: number, viaKey = false) => {
    if (to < 0 || to >= cref.current.blocks.length) return;
    change((c) => moveBlock(c, from, to));
    setSel(to); setSettingsOf(null);
    if (viaKey) setFocusGrip(to);
    setMsg({ tone: 'info', text: t('site.edit.moved', { from: from + 1, to: to + 1 }) });
  };
  const hide = (i: number) => {
    const was = cref.current.blocks[i]?.hidden;
    change((c) => toggleHidden(c, i));
    setMsg({ tone: 'info', text: was ? t('site.edit.shown', { n: i + 1 }) : t('site.edit.hidden', { n: i + 1 }) });
  };
  const remove = (i: number) => {
    change((c) => removeBlock(c, i));
    setSel(null); setSettingsOf(null);
    setMsg({ tone: 'info', text: t('site.edit.removed', { n: i + 1 }), undo: true });
  };
  const insertAt = () => (sel != null && sel >= 0 ? sel + 1 : cref.current.blocks.length);
  const insert = (item: PaletteItem, photo?: string) => {
    const at = picker?.mode === 'insert' ? picker.at : insertAt();
    if (item.needsPhoto && !photo) { setPicker({ mode: 'insert', item, at }); return; }
    change((c) => insertBlock(c, at, item.make(photo)));
    setSel(at); setPicker(null);
    setMsg({ tone: 'info', text: t('site.edit.inserted', { n: at + 1, name: paletteText(t, item).label }) });
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-block-index="${at}"]`);
      el?.scrollIntoView({ block: 'center' });
      // 머리말(선택 칸)보다 제목·글 칸에 먼저 들어간다
      const fields = [...(el?.querySelectorAll<HTMLElement>('.le-text') ?? [])];
      (fields.find((f) => !f.closest('.sec-eyebrow')) ?? fields[0])?.focus();
    });
  };

  // ── 편집 갈고리 (렌더러에 넘김) ──
  const ed: EditHooks | undefined = editing ? {
    text: (path, value, o) => (
      <EditableText key={`${path.join('.')}|${lang}`} value={value} base={getAt(base, path) as LText | undefined} lang={lang} def={defaultLang}
        label={fieldLabel(t, o.label)} multiline={o.multiline} onFocus={arm} onChange={(s) => typed((c) => setLangText(c, path, lang, s))} />
    ),
    image: (path, asset, o, img) => (
      <span className="le-photo" data-empty={asset ? undefined : true}>
        {img ?? <span className="le-photo-empty"><ImagePlus size={22} aria-hidden="true" />{fieldLabel(t, o.label)}</span>}
        <button type="button" className="btn btn-secondary btn-sm le-photo-btn" onClick={() => setPicker({ mode: 'set', path, altPath: o.altPath, optional: o.optional, label: fieldLabel(t, o.label) })}>
          <ImagePlus size={16} aria-hidden="true" />{asset ? t('site.edit.photo.change') : t('site.edit.photo.insert')}<span className="sr-only">: {fieldLabel(t, o.label)}</span>
        </button>
      </span>
    ),
    wrap: (i, b, node) => (
      <div className="le-block" data-block-index={i} data-hidden={b.hidden || undefined} data-selected={sel === i || undefined}
        data-drop={drag && drag.over === i && drag.from !== i ? (drag.from > i ? 'before' : 'after') : undefined}
        data-testid="le-block"
        // 고르기는 누름이 끝난 뒤(click)나 글 칸에 들어갈 때만: 누르는 순간 빈 칸이 펼쳐져 단추가 밀리면 누름이 사라진다
        onClick={() => setSel(i)} onFocusCapture={(e) => { if ((e.target as HTMLElement).classList.contains('le-text')) setSel(i); }}
        onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }); }}
        onDrop={(e) => { e.preventDefault(); if (drag) move(drag.from, i); setDrag(null); }}>
        <BlockBar i={i} b={b} count={content.blocks.length} settingsOpen={settingsOf === i}
          onMove={move} onHide={hide} onRemove={remove} onSettings={() => setSettingsOf(settingsOf === i ? null : i)}
          onDragStart={() => setDrag({ from: i, over: null })} onDragEnd={() => setDrag(null)} />
        {settingsOf === i && (
          <BlockSettings i={i} b={b} langs={langs} lang={lang} onFocus={arm} typed={typed} change={change} assets={assets}
            onAddPhoto={() => setPicker({ mode: 'gallery', i })} />
        )}
        {b.hidden && <p className="le-hidden-note">{t('site.edit.hiddenNote')}</p>}
        {node}
      </div>
    ),
    showEmpty: (i) => sel === i,
  } : undefined;

  const title = pick(content.title, lang, defaultLang) || entry.key;
  const virtue = String(entry.meta.virtue ?? ''), character = String(entry.meta.character ?? '');
  const meta = virtue ? `${virtue}${character ? ` · ${character}` : ''}` : undefined;
  const current = kind === 'page' ? (isHome ? 'home' : `p:${entry.key}`) : kind === 'news' ? 'news' : 'stories';
  const pickT = (x: LText | undefined) => pick(x, lang, defaultLang);

  return (
    <div className="le" data-testid="live-editor">
      <div className="le-toolbar" role="region" aria-label={t('site.edit.toolbar')} data-testid="le-toolbar">
        <div className="le-toolbar-row">
          <Link className="btn btn-ghost btn-sm" href={`/site?box=${kind}&id=${entry.id}`} data-testid="le-to-form"><ArrowLeft size={16} aria-hidden="true" />{t('site.edit.toForm')}</Link>
          {pages.length > 1 && (
            <label className="le-switch">
              <span className="sr-only">{t('site.edit.switchPage')}</span>
              <select value={entry.id} data-testid="le-switch" onChange={(ev) => {
                const to = ev.target.value;
                if (dirty && !window.confirm(t('site.edit.confirmLeave'))) { ev.target.value = entry.id; return; }
                router.push(`/site/edit/${to}`);
              }}>
                {(['page', 'news', 'story'] as EntryKind[]).map((k) => pages.some((x) => x.kind === k) && (
                  <optgroup key={k} label={siteLabel(t, 'kind', k, KIND_LABEL[k])}>
                    {pages.filter((x) => x.kind === k).map((x) => <option key={x.id} value={x.id}>{x.title} · /{x.key}</option>)}
                  </optgroup>))}
              </select>
            </label>
          )}
          {backHref && <a className="btn btn-ghost btn-sm" href={backHref} data-testid="live-edit-back">{t('site.edit.backToPublic')}</a>}
          <Link className="btn btn-ghost btn-sm" href="/site?box=news&new=1" data-testid="live-edit-news">{t('site.edit.writeNews')}</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.dispatchEvent(new Event('chatdock:open'))} data-testid="live-edit-chat">{t('site.edit.requestChange')}</button>
          <div className="le-title">
            <h1>{title}</h1>
            <p className="fine">
              {siteLabel(t, 'kind', kind, KIND_LABEL[kind])} · /{entry.key} · {t('site.edit.latestVersion', { v: latest.version })} · {live ? t('site.edit.liveVersion', { v: live.version }) : t('site.edit.notPublished')}{!siteOpen && ` · ${t('site.edit.siteClosed')}`}
            </p>
          </div>
          {dirty && <span className="badge" data-tone="warning" data-testid="le-dirty">{t('site.edit.dirty')}</span>}
        </div>
        <div className="le-toolbar-row">
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={editing} onClick={() => { setEditing(!editing); setSettingsOf(null); }} data-testid="le-mode">
            {editing ? <><Eye size={16} aria-hidden="true" />{t('site.edit.visitorView')}</> : <><Settings2 size={16} aria-hidden="true" />{t('site.edit.editMode')}</>}
          </button>
          {langs.length > 1 && (
            <div className="le-langs" role="group" aria-label={t('site.edit.langGroup')}>
              {langs.map((l) => (
                <button key={l} type="button" className="btn btn-ghost btn-sm" aria-pressed={l === lang} lang={l} onClick={() => setLang(l)}>
                  {LANG_LABEL[l]}{l === defaultLang && <span className="sr-only"> {t('site.edit.defaultLang')}</span>}
                </button>
              ))}
            </div>
          )}
          {editing && (
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={guide} aria-controls="le-guide" onClick={() => setGuide(!guide)} data-testid="le-guide-toggle">
              <LayoutTemplate size={16} aria-hidden="true" />{t('site.edit.layoutGuide')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!past.length} aria-label={t('site.edit.undo')} title={t('site.edit.undoTitle')}><Undo2 size={16} aria-hidden="true" /></button>
          <span className="le-spacer" />
          <label className="le-note"><span className="sr-only">{t('site.edit.noteLabel')}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('site.edit.notePlaceholder')} maxLength={300} />
          </label>
          <button type="button" className={canPublish ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'} onClick={saveDraft} disabled={busy || !dirty || conflict !== null} data-testid="le-save">{t('site.edit.saveDraft')}</button>
          {canPublish
            ? <button type="button" className="btn btn-primary btn-sm" onClick={publish} disabled={busy || conflict !== null || (!dirty && live?.id === latest.id)} data-testid="le-publish">{dirty ? t('site.edit.saveAndPublish') : t('site.edit.publishLatest')}</button>
            : <span className="fine">{t('site.edit.adminPublishes')}</span>}
        </div>
        {msg && (
          <p className="banner le-msg" data-tone={msg.tone} role="status" data-testid="le-msg">
            {msg.text}{msg.undo && <> <button type="button" className="btn btn-ghost btn-sm" onClick={undo}>{t('site.edit.undo')}</button></>}
          </p>
        )}
      </div>
      {conflict !== null && (
        <div className="banner le-msg" data-tone="warning" role="alert" data-testid="le-conflict">
          <p>{conflict > 0 ? t('site.edit.conflict.newVersion', { v: conflict }) : t('site.edit.conflict.newVersionAny')} {t('site.edit.conflict.body')}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || conflict < 0} onClick={() => run(async () => { await saveVersion(); setConflict(null); }, t('site.edit.conflict.savedMine'))}>{t('site.edit.conflict.saveMine')}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || conflict < 0} onClick={() => { change(() => structuredClone(latest.content)); setConflict(null); setMsg({ tone: 'info', text: t('site.edit.conflict.loaded', { v: latest.version }), undo: true }); }}>{t('site.edit.conflict.loadLatest')}</button>
            {conflict > 0 && <Link className="btn btn-ghost btn-sm" href={`/site/preview/${entry.id}?v=${latest.version}`} target="_blank">{t('site.edit.conflict.previewLatest')}</Link>}
          </div>
        </div>
      )}
      <p id="le-note-missing" hidden>{t('site.edit.note.missing')}</p>
      <p id="le-note-stale" hidden>{t('site.edit.note.stale')}</p>

      <div className="le-body">
        <div className="le-canvas" data-editing={editing || undefined}
          onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); if (a) { e.preventDefault(); if (!editing) setMsg({ tone: 'info', text: t('site.edit.noLinks') }); } }}
          // 쪽 머리 고르기도 구역과 같게: 글 칸에 들어갈 때나 누름이 끝난 뒤(click)만. 누르는 순간 빈 칸이 펼쳐지면 표지 사진 단추가 밀려 누름이 사라진다
          onFocusCapture={(e) => { const el = e.target as HTMLElement; if (el.classList.contains('le-text') && el.closest('.site-head')) setSel(-1); }}
          onClick={(e) => { if ((e.target as HTMLElement).closest('.site-head')) setSel(-1); }}>
          <SiteFrame site={frame} lang={lang} current={current} path="" profile={(isHome ? content.site : profile) ?? undefined} assetUrl={assetUrl}>
            <PageHead content={content} lang={lang} fallback={defaultLang} asset={assetUrl} meta={meta} ed={ed} />
            <SiteBlocks content={content} lang={lang} fallback={defaultLang} assetUrl={assetUrl} link={() => '#'} news={news}
              textInImage={String(entry.meta.text_in_image) === 'true'} ed={ed} />
            {editing && content.blocks.length === 0 && (
              <p className="le-placeholder">{t('site.edit.noBlocks')}</p>
            )}
          </SiteFrame>
        </div>

        {editing && guide && (
          <aside id="le-guide" className="le-guide" aria-label={t('site.edit.layoutGuide')} data-testid="le-guide">
            <div className="le-guide-head">
              <h2>{t('site.edit.layoutGuide')}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGuide(false)} aria-label={t('site.edit.guide.close')}><X size={18} aria-hidden="true" /></button>
            </div>
            <p className="fine" aria-live="polite">{t('site.edit.guide.insertAt', { place: sel != null && sel >= 0 ? t('site.edit.guide.afterBlock', { n: sel + 1 }) : t('site.edit.guide.atEnd') })}</p>
            {kind !== 'story' && (
              <section aria-labelledby="le-pal-layout">
                <h3 id="le-pal-layout">{t('site.edit.guide.layout')}</h3>
                <div className="le-palette">
                  {LAYOUT_PALETTE.map((p) => <PaletteButton key={p.id} p={p} onPick={() => insert(p)} />)}
                </div>
              </section>
            )}
            <section aria-labelledby="le-pal-feature">
              <h3 id="le-pal-feature">{t('site.edit.guide.features')}</h3>
              <div className="le-palette">
                {featurePalette(kind).map((p) => <PaletteButton key={p.id} p={p} onPick={() => insert(p)} />)}
              </div>
            </section>
            <section aria-labelledby="le-outline-h">
              <h3 id="le-outline-h">{t('site.edit.guide.outline')}</h3>
              {content.blocks.length === 0 ? <p className="fine">{t('site.edit.guide.noBlocks')}</p> : (
                <ol className="le-outline" data-testid="le-outline">
                  {content.blocks.map((b, i) => (
                    <li key={i} data-hidden={b.hidden || undefined} data-selected={sel === i || undefined}
                      data-drop={drag && drag.over === i && drag.from !== i ? (drag.from > i ? 'before' : 'after') : undefined}
                      draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDrag({ from: i, over: null }); }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }); }}
                      onDrop={(e) => { e.preventDefault(); if (drag) move(drag.from, i); setDrag(null); }}>
                      <GripVertical size={16} aria-hidden="true" className="le-outline-grip" />
                      <button type="button" className="le-outline-name" onClick={() => {
                        setSel(i);
                        document.querySelector<HTMLElement>(`[data-block-index="${i}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      }}>
                        <b>{i + 1}. {blockLabel(t, b, blockName(b))}</b>{b.hidden && <span className="badge" data-tone="neutral">{t('site.edit.hiddenBadge')}</span>}
                        <small>{blockSnippet(b, pickT)}</small>
                      </button>
                      <span className="le-outline-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t('site.edit.outline.up', { n: i + 1 })}><ArrowUp size={14} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i + 1)} disabled={i === content.blocks.length - 1} aria-label={t('site.edit.outline.down', { n: i + 1 })}><ArrowDown size={14} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(i)} aria-pressed={!!b.hidden} aria-label={t('site.edit.outline.hide', { n: i + 1 })}>{b.hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}</button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section aria-labelledby="le-page-h">
              <h3 id="le-page-h">{t('site.edit.page.info')}</h3>
              <div className="le-page-info">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicker({ mode: 'set', path: ['cover'], optional: true, label: t('site.edit.page.cover') })}>
                  <ImagePlus size={16} aria-hidden="true" />{content.cover ? t('site.edit.page.coverChange') : t('site.edit.page.coverInsert')}
                </button>
                <label>{t('site.edit.page.headLayout')}
                  <select value={content.head?.layout ?? ''} onChange={(e) => change((c) => setAt(c, ['head', 'layout'], e.target.value || undefined))}>
                    <option value="">{t('site.edit.page.head.default')}</option><option value="editorial">{t('site.edit.page.head.editorial')}</option><option value="opening">{t('site.edit.page.head.opening')}</option>
                  </select>
                </label>
                {isHome && <p className="fine">{withLink(t('site.edit.page.homeInfo'), <Link href={`/site?box=page&id=${entry.id}`}>{t('site.edit.page.homeInfoLink')}</Link>)}</p>}
              </div>
            </section>
          </aside>
        )}
      </div>

      {picker && (
        <PhotoPicker picker={picker} assets={assets} langs={langs} content={content}
          onUploaded={(a) => setAssets((xs) => (xs.some((x) => x.id === a.id) ? xs : [a, ...xs]))}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            if (picker.mode === 'insert') { insert(picker.item, id); return; }
            if (picker.mode === 'gallery') {
              change((c) => {
                const b = c.blocks[picker.i] as Extract<Block, { type: 'gallery' }>;
                return setAt(c, ['blocks', picker.i], { ...b, assets: [...b.assets, id], items: b.items ? [...b.items, { asset: id }] : undefined });
              });
              setMsg({ tone: 'info', text: t('site.edit.photo.added') });
              return;
            }
            change((c) => setAt(c, picker.path, id || undefined));
          }}
          onAlt={(path, l, s) => typed((c) => setLangText(c, path, l, s))} onAltFocus={arm} />
      )}
    </div>
  );
}

// ── 고치는 글 칸 ─────────────────────────────────────────
function EditableText({ value, base, lang, def, label, multiline, onFocus, onChange }: {
  value: LText | undefined; base: LText | undefined; lang: Lang; def: Lang; label: string; multiline?: boolean;
  onFocus: () => void; onChange: (s: string) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  const own = value?.[lang] ?? '';
  // 글은 DOM 이 들고 있고(커서를 지키기 위해), 바깥에서 바뀌었을 때(되돌리기·새 판)만 맞춘다
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== own) el.textContent = own;
  }, [own]);
  const state = translationState(value, base, lang, def);
  const fallback = own ? '' : pick(value, lang, def);
  return (
    <span ref={ref} className="le-text" data-multiline={multiline || undefined} data-state={state ?? (own ? undefined : 'empty')}
      contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" tabIndex={0} spellCheck lang={lang}
      aria-label={`${label} (${LANG_LABEL[lang]})`} aria-multiline={multiline || undefined}
      aria-describedby={state === 'missing' ? 'le-note-missing' : state === 'stale' ? 'le-note-stale' : undefined}
      data-placeholder={fallback || t('site.edit.text.placeholder', { label })}
      onFocus={onFocus}
      onInput={(e) => {
        const el = e.currentTarget;
        let s = el.innerText.replace(/ /g, ' ');
        if (!multiline) s = s.replace(/\s*\n\s*/g, ' ');
        s = s.replace(/\n$/, '');
        if (!s.trim() && el.childNodes.length) el.textContent = ''; // 남은 <br> 을 비워 안내 글이 다시 보이게
        onChange(s.trim() ? s : '');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') e.currentTarget.blur();
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? pasted : pasted.replace(/\s*\n\s*/g, ' '));
      }} />
  );
}

// ── 구역 막대 ────────────────────────────────────────────
function BlockBar({ i, b, count, settingsOpen, onMove, onHide, onRemove, onSettings, onDragStart, onDragEnd }: {
  i: number; b: Block; count: number; settingsOpen: boolean;
  onMove: (from: number, to: number, viaKey?: boolean) => void; onHide: (i: number) => void; onRemove: (i: number) => void; onSettings: () => void;
  onDragStart: () => void; onDragEnd: () => void;
}) {
  const { t } = useI18n();
  const name = blockLabel(t, b, blockName(b));
  const hasSettings = b.type === 'section' || b.type === 'gallery' || b.type === 'news_list' || b.type === 'video' || b.type === 'image';
  return (
    <div className="le-bar" role="group" aria-label={t('site.edit.bar.group', { n: i + 1, name })}>
      <button type="button" className="le-grip" data-grip={i} draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); onDragStart(); }}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onMove(i, i - 1, true); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onMove(i, i + 1, true); }
        }}
        aria-label={t('site.edit.bar.move', { n: i + 1 })} aria-description={t('site.edit.bar.moveHint')}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="le-bar-name">{i + 1}. {name}{b.hidden && <span className="badge" data-tone="neutral">{t('site.edit.hiddenBadge')}</span>}</span>
      <span className="le-bar-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(i, i - 1)} disabled={i === 0} aria-label={t('site.edit.bar.up', { n: i + 1 })}><ArrowUp size={16} aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(i, i + 1)} disabled={i === count - 1} aria-label={t('site.edit.bar.down', { n: i + 1 })}><ArrowDown size={16} aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHide(i)} aria-pressed={!!b.hidden} aria-label={t('site.edit.bar.hide', { n: i + 1 })}>
          {b.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
        {hasSettings && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSettings} aria-expanded={settingsOpen} aria-label={t('site.edit.bar.settings', { n: i + 1 })}><Settings2 size={16} aria-hidden="true" /></button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(i)} aria-label={t('site.edit.bar.remove', { n: i + 1 })}><Trash2 size={16} aria-hidden="true" /></button>
      </span>
    </div>
  );
}

// ── 구역 설정 (글·사진 밖의 값) ──────────────────────────
function BlockSettings({ i, b, langs, lang, onFocus, typed, change, assets, onAddPhoto }: {
  i: number; b: Block; langs: Lang[]; lang: Lang; onFocus: () => void;
  typed: (fn: (c: Content) => Content) => void; change: (fn: (c: Content) => Content, record?: boolean) => void; assets: Asset[]; onAddPhoto: () => void;
}) {
  const { t } = useI18n();
  const at = (...p: EditPath): EditPath => ['blocks', i, ...p];
  const setB = (nb: Block) => change((c) => setAt(c, ['blocks', i], nb));
  const name = (id: string) => assets.find((a) => a.id === id)?.name ?? t('site.edit.settings.photo');
  let body: ReactNode = null;
  if (b.type === 'section') {
    const items = b.items ?? [];
    body = <>
      <label>{t('site.edit.settings.shape')}
        <select value={b.template} onChange={(e) => setB({ ...b, template: e.target.value as SectionTemplate })}>
          {SECTION_TEMPLATES.map((tp) => <option key={tp} value={tp}>{siteLabel(t, 'section', tp, SECTION_LABEL[tp])}</option>)}
        </select>
      </label>
      {HAS_ITEMS.includes(b.template) && (
        <fieldset>
          <legend>{t('site.edit.settings.items', { n: items.length })} <span className="fine">{t('site.edit.settings.itemsHint')}</span></legend>
          <ol className="le-items">
            {items.map((it, k) => (
              <li key={k}>
                <span>{k + 1}. {pick(it.title, lang, langs[0]) || t('site.edit.settings.untitled')}</span>
                {b.template === 'cards' && (
                  <label className="fine">{t('site.edit.settings.link')}
                    <input value={it.href ?? ''} placeholder={t('site.edit.settings.linkPlaceholder')} onFocus={onFocus}
                      onChange={(e) => typed((c) => setAt(c, at('items', k, 'href'), e.target.value || undefined))} />
                  </label>
                )}
                <button type="button" className="btn btn-ghost btn-sm" disabled={k === 0} aria-label={t('site.edit.settings.itemUp', { n: k + 1 })}
                  onClick={() => { const n = [...items]; [n[k - 1], n[k]] = [n[k], n[k - 1]]; setB({ ...b, items: n }); }}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={k === items.length - 1} aria-label={t('site.edit.settings.itemDown', { n: k + 1 })}
                  onClick={() => { const n = [...items]; [n[k], n[k + 1]] = [n[k + 1], n[k]]; setB({ ...b, items: n }); }}><ArrowDown size={14} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setB({ ...b, items: items.filter((_, j) => j !== k) })}>{t('site.edit.settings.itemRemove', { n: k + 1 })}</button>
              </li>
            ))}
          </ol>
          {items.length < 12 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setB({ ...b, items: [...items, {}] })}><Plus size={14} aria-hidden="true" />{t('site.edit.settings.itemAdd')}</button>}
        </fieldset>
      )}
      {b.button
        ? <div className="le-row">
            <label>{t('site.edit.settings.buttonLink')} <span className="fine">{t('site.edit.settings.buttonLinkHint')}</span>
              <input value={b.button.href} onFocus={onFocus} onChange={(e) => typed((c) => setAt(c, at('button', 'href'), e.target.value))} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const { button: _x, ...rest } = b; void _x; setB(rest as Block); }}>{t('site.edit.settings.buttonRemove')}</button>
          </div>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setB({ ...b, button: { label: {}, href: '/p/contact' } })}><Plus size={14} aria-hidden="true" />{t('site.edit.settings.buttonAdd')}</button>}
    </>;
  } else if (b.type === 'gallery') {
    body = <>
      <label><input type="checkbox" checked={b.download === 'png'} onChange={(e) => setB({ ...b, download: e.target.checked ? 'png' : undefined, scene: e.target.checked ? b.scene ?? 1 : undefined })} />{t('site.edit.settings.pngDownload')}</label>
      {b.download === 'png' && <label>{t('site.edit.settings.sceneNo')}<input type="number" min={1} max={200} value={b.scene ?? 1} onChange={(e) => setB({ ...b, scene: Number(e.target.value) })} /></label>}
      {b.download === 'png' && (b.items ?? b.assets.map((asset) => ({ asset, alt: {} as LText }))).map((item, k) => <label key={k}>{t('site.edit.settings.characterAlt', { n: k + 1, lang: LANG_LABEL[lang] })}
        <input value={item.alt?.[lang] ?? ''} onFocus={onFocus} onChange={(e) => typed((c) => {
          const cur = c.blocks[i] as Extract<Block, { type: 'gallery' }>;
          const items = cur.items ?? cur.assets.map((asset) => ({ asset, alt: {} as LText }));
          return setAt(c, at('items'), items.map((it, j) => j === k ? { ...it, alt: { ...it.alt, [lang]: e.target.value } } : it));
        })} />
      </label>)}

      <ul className="le-thumbs">
        {b.assets.map((a, k) => (
          <li key={a + k}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(a)} alt="" />
            <button type="button" className="btn btn-ghost btn-sm" disabled={b.assets.length === 1}
              onClick={() => setB({ ...b, assets: b.assets.filter((_, j) => j !== k), items: b.items?.filter((_, j) => j !== k) })}>
              {t('site.edit.settings.remove')}<span className="sr-only">: {t('site.edit.settings.photoN', { n: k + 1, name: name(a) })}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAddPhoto}><ImagePlus size={16} aria-hidden="true" />{t('site.edit.settings.photoAdd')}</button>
    </>;
  } else if (b.type === 'news_list') {
    body = <div className="le-row">
      <label>{t('site.edit.settings.newsCount')}<input type="number" min={1} max={10} value={b.count} onChange={(e) => setB({ ...b, count: Math.min(10, Math.max(1, Number(e.target.value) || 3)) })} /></label>
      <label>{t('site.edit.settings.shape')}<select value={b.style} onChange={(e) => setB({ ...b, style: e.target.value as 'cards' | 'list' })}><option value="cards">{t('site.edit.settings.style.cards')}</option><option value="list">{t('site.edit.settings.style.list')}</option></select></label>
    </div>;
  } else if (b.type === 'video') {
    body = <>{langs.map((l) => (
      <label key={l}>{t('site.edit.settings.videoUrl')} <span className="fine">{LANG_LABEL[l]} · YouTube·Vimeo·Google Drive</span>
        <input value={b.url[l] ?? ''} onFocus={onFocus} onChange={(e) => typed((c) => setLangText(c, at('url'), l, e.target.value.trim()))} />
      </label>))}</>;
  } else if (b.type === 'image') {
    body = <>{langs.map((l) => (
      <label key={l}>{t('site.edit.alt')} <span className="fine">{LANG_LABEL[l]} · {t('site.edit.settings.altHint')}</span>
        <input value={b.alt?.[l] ?? ''} onFocus={onFocus} onChange={(e) => typed((c) => setLangText(c, at('alt'), l, e.target.value))} />
      </label>))}</>;
  }
  return <div className="le-settings" data-testid="le-settings">{body}</div>;
}

function PaletteButton({ p, onPick }: { p: PaletteItem; onPick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="le-pal" onClick={onPick} data-palette={p.id}>
      <b>{paletteText(t, p).label}</b><span>{paletteText(t, p).hint}{p.needsPhoto ? ` · ${t('site.edit.palette.photoFirst')}` : ''}</span>
    </button>
  );
}

// ── 사진함 ───────────────────────────────────────────────
function PhotoPicker({ picker, assets, langs, content, onUploaded, onPick, onClose, onAlt, onAltFocus }: {
  picker: Picker; assets: Asset[]; langs: Lang[]; content: Content;
  onUploaded: (a: Asset) => void; onPick: (id: string) => void; onClose: () => void;
  onAlt: (path: EditPath, l: Lang, s: string) => void; onAltFocus: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, []);
  const current = picker.mode === 'set' ? (getAt(content, picker.path) as string | undefined) : undefined;
  const label = picker.mode === 'set' ? picker.label : picker.mode === 'insert' ? t('site.edit.picker.forInsert', { name: paletteText(t, picker.item).label }) : t('site.edit.picker.forGallery');
  const alt = picker.mode === 'set' && picker.altPath && current ? (getAt(content, picker.altPath) as LText | undefined) : undefined;
  async function upload(files: File[], { signal, progress }: FileDropContext) {
    let last = '';
    for (const [i, file] of files.entries()) {
      const form = new FormData(); form.append('file', file);
      const res = await uploadWithProgress('/api/site/assets', form, { signal, onProgress: (r) => progress((i + r) / files.length) });
      const data = res.body as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(`${file.name}: ${data.error ?? t('site.edit.picker.uploadFailed')}`);
      onUploaded({ id: data.id, name: file.name });
      last = data.id;
    }
    // 한 장이면 바로 고르고, 여러 장이면 사진함에 넣기만 한다(고르기는 아래 목록에서)
    if (files.length === 1) onPick(last);
    return files.length === 1 ? t('site.edit.picker.uploadedOne', { name: files[0].name }) : t('site.edit.picker.uploadedMany', { n: files.length });
  }
  return (
    <dialog ref={ref} className="le-picker" aria-labelledby="le-picker-h" onClose={onClose} data-testid="le-picker">
      <div className="le-picker-head">
        <h2 id="le-picker-h">{label}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ref.current?.close()} aria-label={t('site.edit.picker.close')}><X size={18} aria-hidden="true" /></button>
      </div>
      <FileDrop
        compact label={t('site.edit.picker.upload')} multiple maxFiles={10} onFiles={upload} testId="le-upload" inputTestId="le-upload-input"
        accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif']} typeLabel="PNG·JPG·WEBP·GIF" maxSize={5 * 1024 * 1024}
        hint={<span data-testid="photo-consent">{t('site.asset.photoConsent')}</span>}
      />
      {assets.length === 0 ? <p className="fine">{t('site.edit.picker.empty')}</p> : (
        <ul className="le-assets" aria-label={t('site.edit.picker.library')}>
          {assets.map((a) => (
            <li key={a.id}>
              <button type="button" aria-pressed={a.id === current} onClick={() => onPick(a.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(a.id)} alt="" loading="lazy" /><span>{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picker.mode === 'set' && picker.altPath && current && (
        <fieldset className="le-alt">
          <legend>{t('site.edit.alt')} <span className="fine">{t('site.edit.picker.altHint')}</span></legend>
          {langs.map((l) => (
            <label key={l}>{LANG_LABEL[l]}
              <input value={alt?.[l] ?? ''} lang={l} onFocus={onAltFocus} onChange={(e) => onAlt(picker.altPath!, l, e.target.value)} />
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-actions">
        {picker.mode === 'set' && picker.optional && current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick('')}>{t('site.edit.picker.removePhoto')}</button>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.close()}>{t('site.edit.picker.done')}</button>
      </div>
    </dialog>
  );
}
