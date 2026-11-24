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
  if (!res.ok) throw Object.assign(new Error(data.error ?? '저장하지 못했습니다.'), { status: res.status });
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
export function LiveEditor({ detail, frame, langs, defaultLang, canPublish, assets: initialAssets, news, profile, siteOpen, backHref }: {
  /** 48차: 공개 화면에서 왔으면 돌아갈 주소 */ backHref?: string | null;
  detail: Detail; frame: PublicSite; langs: Lang[]; defaultLang: Lang; canPublish: boolean; assets: Asset[]; news: NewsItem[];
  profile: SiteProfile | null; siteOpen: boolean;
}) {
  const router = useRouter();
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
        setMsg({ tone: 'danger', text: '그 사이 다른 사람이 새 판을 저장했습니다. 내 고침은 화면에 그대로 있습니다.' });
      } else setMsg({ tone: 'danger', text: err.message });
    }
    finally { setBusy(false); }
  }
  const saveDraft = () => run(saveVersion, '시안(새 판)으로 저장했습니다. 방문자 화면은 공개할 때 바뀝니다.');
  const publish = () => run(async () => {
    if (dirty) await saveVersion();
    await send(`/api/site/entries/${entry.id}/publish`, 'POST', {});
  }, '공개했습니다. 방문자 화면에 바로 보입니다.');

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
    setMsg({ tone: 'info', text: `${from + 1}번 구역을 ${to + 1}번 자리로 옮겼습니다.` });
  };
  const hide = (i: number) => {
    const was = cref.current.blocks[i]?.hidden;
    change((c) => toggleHidden(c, i));
    setMsg({ tone: 'info', text: was ? `${i + 1}번 구역을 다시 보이게 했습니다.` : `${i + 1}번 구역을 숨겼습니다. 방문자에게 보이지 않습니다.` });
  };
  const remove = (i: number) => {
    change((c) => removeBlock(c, i));
    setSel(null); setSettingsOf(null);
    setMsg({ tone: 'info', text: `${i + 1}번 구역을 지웠습니다.`, undo: true });
  };
  const insertAt = () => (sel != null && sel >= 0 ? sel + 1 : cref.current.blocks.length);
  const insert = (item: PaletteItem, photo?: string) => {
    const at = picker?.mode === 'insert' ? picker.at : insertAt();
    if (item.needsPhoto && !photo) { setPicker({ mode: 'insert', item, at }); return; }
    change((c) => insertBlock(c, at, item.make(photo)));
    setSel(at); setPicker(null);
    setMsg({ tone: 'info', text: `${at + 1}번 자리에 '${item.label}'을(를) 넣었습니다. 바로 글을 적어 보세요.` });
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
        label={o.label} multiline={o.multiline} onFocus={arm} onChange={(s) => typed((c) => setLangText(c, path, lang, s))} />
    ),
    image: (path, asset, o, img) => (
      <span className="le-photo" data-empty={asset ? undefined : true}>
        {img ?? <span className="le-photo-empty"><ImagePlus size={22} aria-hidden="true" />{o.label}</span>}
        <button type="button" className="btn btn-secondary btn-sm le-photo-btn" onClick={() => setPicker({ mode: 'set', path, altPath: o.altPath, optional: o.optional, label: o.label })}>
          <ImagePlus size={16} aria-hidden="true" />{asset ? '사진 바꾸기' : '사진 넣기'}<span className="sr-only">: {o.label}</span>
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
        {b.hidden && <p className="le-hidden-note">숨긴 구역 — 방문자에게 보이지 않습니다.</p>}
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
      <div className="le-toolbar" role="region" aria-label="화면 편집 막대" data-testid="le-toolbar">
        <div className="le-toolbar-row">
          <Link className="btn btn-ghost btn-sm" href={`/site?box=${kind}&id=${entry.id}`}><ArrowLeft size={16} aria-hidden="true" />목록</Link>
          {backHref && <a className="btn btn-ghost btn-sm" href={backHref} data-testid="live-edit-back">공개 화면으로</a>}
          <Link className="btn btn-ghost btn-sm" href="/site?box=news&new=1" data-testid="live-edit-news">소식 쓰기</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.dispatchEvent(new Event('chatdock:open'))} data-testid="live-edit-chat">개선 요청</button>
          <div className="le-title">
            <h1>{title}</h1>
            <p className="fine">
              {KIND_LABEL[kind]} · /{entry.key} · 최신 {latest.version}판 · {live ? `공개 중 ${live.version}판` : '공개 안 함'}{!siteOpen && ' · 홈페이지 닫힘'}
            </p>
          </div>
          {dirty && <span className="badge" data-tone="warning" data-testid="le-dirty">저장 안 한 변경</span>}
        </div>
        <div className="le-toolbar-row">
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={editing} onClick={() => { setEditing(!editing); setSettingsOf(null); }} data-testid="le-mode">
            {editing ? <><Eye size={16} aria-hidden="true" />방문자 모습 보기</> : <><Settings2 size={16} aria-hidden="true" />편집 모드로</>}
          </button>
          {langs.length > 1 && (
            <div className="le-langs" role="group" aria-label="고칠 언어">
              {langs.map((l) => (
                <button key={l} type="button" className="btn btn-ghost btn-sm" aria-pressed={l === lang} lang={l} onClick={() => setLang(l)}>
                  {LANG_LABEL[l]}{l === defaultLang && <span className="sr-only"> (기본 언어)</span>}
                </button>
              ))}
            </div>
          )}
          {editing && (
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={guide} aria-controls="le-guide" onClick={() => setGuide(!guide)} data-testid="le-guide-toggle">
              <LayoutTemplate size={16} aria-hidden="true" />레이아웃 가이드
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!past.length} aria-label="되돌리기" title="되돌리기 (Ctrl+Z)"><Undo2 size={16} aria-hidden="true" /></button>
          <span className="le-spacer" />
          <label className="le-note"><span className="sr-only">이번 판 메모 (선택)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="판 메모 (선택)" maxLength={300} />
          </label>
          <button type="button" className={canPublish ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'} onClick={saveDraft} disabled={busy || !dirty || conflict !== null} data-testid="le-save">시안 저장</button>
          {canPublish
            ? <button type="button" className="btn btn-primary btn-sm" onClick={publish} disabled={busy || conflict !== null || (!dirty && live?.id === latest.id)} data-testid="le-publish">{dirty ? '저장하고 공개' : '최신 판 공개'}</button>
            : <span className="fine">공개는 학교 관리자가 합니다.</span>}
        </div>
        {msg && (
          <p className="banner le-msg" data-tone={msg.tone} role="status" data-testid="le-msg">
            {msg.text}{msg.undo && <> <button type="button" className="btn btn-ghost btn-sm" onClick={undo}>되돌리기</button></>}
          </p>
        )}
      </div>
      {conflict !== null && (
        <div className="banner le-msg" data-tone="warning" role="alert" data-testid="le-conflict">
          <p>{conflict > 0 ? `이 화면을 연 뒤 ${conflict}판이 새로 저장되었습니다.` : '그 사이 새 판이 저장되었습니다.'} 내 고침은 아직 저장되지 않았습니다.
            두 판은 모두 판 기록에 남으므로 어느 쪽을 골라도 다른 쪽을 다시 불러올 수 있습니다.</p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || conflict < 0} onClick={() => run(async () => { await saveVersion(); setConflict(null); }, '내 고침을 최신 판 위에 새 판으로 저장했습니다.')}>내 고침을 최신 판 위에 저장</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || conflict < 0} onClick={() => { change(() => structuredClone(latest.content)); setConflict(null); setMsg({ tone: 'info', text: `최신 ${latest.version}판을 불러왔습니다. 되돌리기로 내 고침을 다시 볼 수 있습니다.`, undo: true }); }}>최신 판 불러오기</button>
            {conflict > 0 && <Link className="btn btn-ghost btn-sm" href={`/site/preview/${entry.id}?v=${latest.version}`} target="_blank">최신 판 미리보기</Link>}
          </div>
        </div>
      )}
      <p id="le-note-missing" hidden>이 언어 글이 비어 있어 기본 언어 글을 흐리게 보여 줍니다.</p>
      <p id="le-note-stale" hidden>기본 언어 글이 공개본과 달라졌는데 이 언어 글은 그대로입니다. 번역을 확인해 주세요.</p>

      <div className="le-body">
        <div className="le-canvas" data-editing={editing || undefined}
          onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); if (a) { e.preventDefault(); if (!editing) setMsg({ tone: 'info', text: '편집 화면에서는 링크를 따라가지 않습니다. 공개 화면에서 확인하세요.' }); } }}
          // 쪽 머리 고르기도 구역과 같게: 글 칸에 들어갈 때나 누름이 끝난 뒤(click)만. 누르는 순간 빈 칸이 펼쳐지면 표지 사진 단추가 밀려 누름이 사라진다
          onFocusCapture={(e) => { const el = e.target as HTMLElement; if (el.classList.contains('le-text') && el.closest('.site-head')) setSel(-1); }}
          onClick={(e) => { if ((e.target as HTMLElement).closest('.site-head')) setSel(-1); }}>
          <SiteFrame site={frame} lang={lang} current={current} path="" profile={(isHome ? content.site : profile) ?? undefined} assetUrl={assetUrl}>
            <PageHead content={content} lang={lang} fallback={defaultLang} asset={assetUrl} meta={meta} ed={ed} />
            <SiteBlocks content={content} lang={lang} fallback={defaultLang} assetUrl={assetUrl} link={() => '#'} news={news}
              textInImage={String(entry.meta.text_in_image) === 'true'} ed={ed} />
            {editing && content.blocks.length === 0 && (
              <p className="le-placeholder">아직 구역이 없습니다. 레이아웃 가이드에서 구역을 넣어 보세요.</p>
            )}
          </SiteFrame>
        </div>

        {editing && guide && (
          <aside id="le-guide" className="le-guide" aria-label="레이아웃 가이드" data-testid="le-guide">
            <div className="le-guide-head">
              <h2>레이아웃 가이드</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGuide(false)} aria-label="레이아웃 가이드 닫기"><X size={18} aria-hidden="true" /></button>
            </div>
            <p className="fine" aria-live="polite">넣을 자리: {sel != null && sel >= 0 ? `${sel + 1}번 구역 다음` : '맨 끝'}</p>
            {kind !== 'story' && (
              <section aria-labelledby="le-pal-layout">
                <h3 id="le-pal-layout">레이아웃</h3>
                <div className="le-palette">
                  {LAYOUT_PALETTE.map((p) => <PaletteButton key={p.id} p={p} onPick={() => insert(p)} />)}
                </div>
              </section>
            )}
            <section aria-labelledby="le-pal-feature">
              <h3 id="le-pal-feature">기능</h3>
              <div className="le-palette">
                {featurePalette(kind).map((p) => <PaletteButton key={p.id} p={p} onPick={() => insert(p)} />)}
              </div>
            </section>
            <section aria-labelledby="le-outline-h">
              <h3 id="le-outline-h">페이지 구조</h3>
              {content.blocks.length === 0 ? <p className="fine">구역이 없습니다.</p> : (
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
                        <b>{i + 1}. {blockName(b)}</b>{b.hidden && <span className="badge" data-tone="neutral">숨김</span>}
                        <small>{blockSnippet(b, pickT)}</small>
                      </button>
                      <span className="le-outline-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`${i + 1}번 위로`}><ArrowUp size={14} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i + 1)} disabled={i === content.blocks.length - 1} aria-label={`${i + 1}번 아래로`}><ArrowDown size={14} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(i)} aria-pressed={!!b.hidden} aria-label={`${i + 1}번 숨기기`}>{b.hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}</button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section aria-labelledby="le-page-h">
              <h3 id="le-page-h">쪽 정보</h3>
              <div className="le-page-info">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicker({ mode: 'set', path: ['cover'], optional: true, label: '표지 사진' })}>
                  <ImagePlus size={16} aria-hidden="true" />{content.cover ? '표지 사진 바꾸기' : '표지 사진 넣기'}
                </button>
                <label>쪽 머리 모양
                  <select value={content.head?.layout ?? ''} onChange={(e) => change((c) => setAt(c, ['head', 'layout'], e.target.value || undefined))}>
                    <option value="">기본</option><option value="editorial">잡지형 머리</option><option value="opening">여는 화면 (표지 사진 크게)</option>
                  </select>
                </label>
                {isHome && <p className="fine">로고·주소·전화 같은 머리·바닥 정보는 <Link href={`/site?box=page&id=${entry.id}`}>자세한 편집기</Link>에서 고칩니다.</p>}
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
              setMsg({ tone: 'info', text: '사진을 더했습니다.' });
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
      data-placeholder={fallback || `${label} 적기`}
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
        const t = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? t : t.replace(/\s*\n\s*/g, ' '));
      }} />
  );
}

// ── 구역 막대 ────────────────────────────────────────────
function BlockBar({ i, b, count, settingsOpen, onMove, onHide, onRemove, onSettings, onDragStart, onDragEnd }: {
  i: number; b: Block; count: number; settingsOpen: boolean;
  onMove: (from: number, to: number, viaKey?: boolean) => void; onHide: (i: number) => void; onRemove: (i: number) => void; onSettings: () => void;
  onDragStart: () => void; onDragEnd: () => void;
}) {
  const name = blockName(b);
  const hasSettings = b.type === 'section' || b.type === 'gallery' || b.type === 'news_list' || b.type === 'video' || b.type === 'image';
  return (
    <div className="le-bar" role="group" aria-label={`${i + 1}번 구역: ${name}`}>
      <button type="button" className="le-grip" data-grip={i} draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); onDragStart(); }}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onMove(i, i - 1, true); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onMove(i, i + 1, true); }
        }}
        aria-label={`${i + 1}번 구역 옮기기`} aria-description="끌어서 옮기거나, 누른 채 위·아래 화살표 키로 옮깁니다">
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="le-bar-name">{i + 1}. {name}{b.hidden && <span className="badge" data-tone="neutral">숨김</span>}</span>
      <span className="le-bar-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(i, i - 1)} disabled={i === 0} aria-label={`${i + 1}번 구역 위로`}><ArrowUp size={16} aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(i, i + 1)} disabled={i === count - 1} aria-label={`${i + 1}번 구역 아래로`}><ArrowDown size={16} aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHide(i)} aria-pressed={!!b.hidden} aria-label={`${i + 1}번 구역 숨기기`}>
          {b.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
        {hasSettings && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSettings} aria-expanded={settingsOpen} aria-label={`${i + 1}번 구역 설정`}><Settings2 size={16} aria-hidden="true" /></button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(i)} aria-label={`${i + 1}번 구역 지우기`}><Trash2 size={16} aria-hidden="true" /></button>
      </span>
    </div>
  );
}

// ── 구역 설정 (글·사진 밖의 값) ──────────────────────────
function BlockSettings({ i, b, langs, lang, onFocus, typed, change, assets, onAddPhoto }: {
  i: number; b: Block; langs: Lang[]; lang: Lang; onFocus: () => void;
  typed: (fn: (c: Content) => Content) => void; change: (fn: (c: Content) => Content, record?: boolean) => void; assets: Asset[]; onAddPhoto: () => void;
}) {
  const at = (...p: EditPath): EditPath => ['blocks', i, ...p];
  const setB = (nb: Block) => change((c) => setAt(c, ['blocks', i], nb));
  const name = (id: string) => assets.find((a) => a.id === id)?.name ?? '사진';
  let body: ReactNode = null;
  if (b.type === 'section') {
    const items = b.items ?? [];
    body = <>
      <label>모양
        <select value={b.template} onChange={(e) => setB({ ...b, template: e.target.value as SectionTemplate })}>
          {SECTION_TEMPLATES.map((t) => <option key={t} value={t}>{SECTION_LABEL[t]}</option>)}
        </select>
      </label>
      {HAS_ITEMS.includes(b.template) && (
        <fieldset>
          <legend>항목 {items.length}개 <span className="fine">글은 화면에서 바로 고칩니다</span></legend>
          <ol className="le-items">
            {items.map((it, k) => (
              <li key={k}>
                <span>{k + 1}. {pick(it.title, lang, langs[0]) || '(제목 없음)'}</span>
                {b.template === 'cards' && (
                  <label className="fine">링크
                    <input value={it.href ?? ''} placeholder="/p/about 또는 https://…" onFocus={onFocus}
                      onChange={(e) => typed((c) => setAt(c, at('items', k, 'href'), e.target.value || undefined))} />
                  </label>
                )}
                <button type="button" className="btn btn-ghost btn-sm" disabled={k === 0} aria-label={`${k + 1}번 항목 위로`}
                  onClick={() => { const n = [...items]; [n[k - 1], n[k]] = [n[k], n[k - 1]]; setB({ ...b, items: n }); }}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={k === items.length - 1} aria-label={`${k + 1}번 항목 아래로`}
                  onClick={() => { const n = [...items]; [n[k], n[k + 1]] = [n[k + 1], n[k]]; setB({ ...b, items: n }); }}><ArrowDown size={14} aria-hidden="true" /></button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setB({ ...b, items: items.filter((_, j) => j !== k) })}>{k + 1}번 항목 빼기</button>
              </li>
            ))}
          </ol>
          {items.length < 12 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setB({ ...b, items: [...items, {}] })}><Plus size={14} aria-hidden="true" />항목 더하기</button>}
        </fieldset>
      )}
      {b.button
        ? <div className="le-row">
            <label>단추 링크 <span className="fine">/p/contact 또는 https://…</span>
              <input value={b.button.href} onFocus={onFocus} onChange={(e) => typed((c) => setAt(c, at('button', 'href'), e.target.value))} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const { button: _x, ...rest } = b; void _x; setB(rest as Block); }}>단추 빼기</button>
          </div>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setB({ ...b, button: { label: {}, href: '/p/contact' } })}><Plus size={14} aria-hidden="true" />단추 더하기</button>}
    </>;
  } else if (b.type === 'gallery') {
    body = <>
      <label><input type="checkbox" checked={b.download === 'png'} onChange={(e) => setB({ ...b, download: e.target.checked ? 'png' : undefined, scene: e.target.checked ? b.scene ?? 1 : undefined })} />장면 캐릭터 PNG 내려받기</label>
      {b.download === 'png' && <label>장면 번호<input type="number" min={1} max={200} value={b.scene ?? 1} onChange={(e) => setB({ ...b, scene: Number(e.target.value) })} /></label>}
      {b.download === 'png' && (b.items ?? b.assets.map((asset) => ({ asset, alt: {} as LText }))).map((item, k) => <label key={k}>{k + 1}번 캐릭터 이름·대체 글 ({LANG_LABEL[lang]})
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
              빼기<span className="sr-only">: {k + 1}번 사진 {name(a)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAddPhoto}><ImagePlus size={16} aria-hidden="true" />사진 더하기</button>
    </>;
  } else if (b.type === 'news_list') {
    body = <div className="le-row">
      <label>보일 소식 수<input type="number" min={1} max={10} value={b.count} onChange={(e) => setB({ ...b, count: Math.min(10, Math.max(1, Number(e.target.value) || 3)) })} /></label>
      <label>모양<select value={b.style} onChange={(e) => setB({ ...b, style: e.target.value as 'cards' | 'list' })}><option value="cards">카드</option><option value="list">목록</option></select></label>
    </div>;
  } else if (b.type === 'video') {
    body = <>{langs.map((l) => (
      <label key={l}>영상 주소 <span className="fine">{LANG_LABEL[l]} · YouTube·Vimeo·Google Drive</span>
        <input value={b.url[l] ?? ''} onFocus={onFocus} onChange={(e) => typed((c) => setLangText(c, at('url'), l, e.target.value.trim()))} />
      </label>))}</>;
  } else if (b.type === 'image') {
    body = <>{langs.map((l) => (
      <label key={l}>대체 글 <span className="fine">{LANG_LABEL[l]} · 사진을 볼 수 없는 사람에게 읽어 줌</span>
        <input value={b.alt?.[l] ?? ''} onFocus={onFocus} onChange={(e) => typed((c) => setLangText(c, at('alt'), l, e.target.value))} />
      </label>))}</>;
  }
  return <div className="le-settings" data-testid="le-settings">{body}</div>;
}

function PaletteButton({ p, onPick }: { p: PaletteItem; onPick: () => void }) {
  return (
    <button type="button" className="le-pal" onClick={onPick} data-palette={p.id}>
      <b>{p.label}</b><span>{p.hint}{p.needsPhoto ? ' · 사진부터 고름' : ''}</span>
    </button>
  );
}

// ── 사진함 ───────────────────────────────────────────────
function PhotoPicker({ picker, assets, langs, content, onUploaded, onPick, onClose, onAlt, onAltFocus }: {
  picker: Picker; assets: Asset[]; langs: Lang[]; content: Content;
  onUploaded: (a: Asset) => void; onPick: (id: string) => void; onClose: () => void;
  onAlt: (path: EditPath, l: Lang, s: string) => void; onAltFocus: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, []);
  const current = picker.mode === 'set' ? (getAt(content, picker.path) as string | undefined) : undefined;
  const label = picker.mode === 'set' ? picker.label : picker.mode === 'insert' ? `${picker.item.label}에 넣을 사진` : '사진 묶음에 더할 사진';
  const alt = picker.mode === 'set' && picker.altPath && current ? (getAt(content, picker.altPath) as LText | undefined) : undefined;
  async function upload(files: File[], { signal, progress }: FileDropContext) {
    let last = '';
    for (const [i, file] of files.entries()) {
      const form = new FormData(); form.append('file', file);
      const res = await uploadWithProgress('/api/site/assets', form, { signal, onProgress: (r) => progress((i + r) / files.length) });
      const data = res.body as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(`${file.name}: ${data.error ?? '올리지 못했습니다.'}`);
      onUploaded({ id: data.id, name: file.name });
      last = data.id;
    }
    // 한 장이면 바로 고르고, 여러 장이면 사진함에 넣기만 한다(고르기는 아래 목록에서)
    if (files.length === 1) onPick(last);
    return files.length === 1 ? `‘${files[0].name}’을(를) 올렸습니다.` : `${files.length}장을 사진함에 올렸습니다.`;
  }
  return (
    <dialog ref={ref} className="le-picker" aria-labelledby="le-picker-h" onClose={onClose} data-testid="le-picker">
      <div className="le-picker-head">
        <h2 id="le-picker-h">{label}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ref.current?.close()} aria-label="사진함 닫기"><X size={18} aria-hidden="true" /></button>
      </div>
      <FileDrop
        compact label="새 사진 올리기" multiple maxFiles={10} onFiles={upload} testId="le-upload" inputTestId="le-upload-input"
        accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif']} typeLabel="PNG·JPG·WEBP·GIF" maxSize={5 * 1024 * 1024}
        hint={<span data-testid="photo-consent">{PHOTO_CONSENT}</span>}
      />
      {assets.length === 0 ? <p className="fine">사진함이 비어 있습니다. 위에서 올려 주세요.</p> : (
        <ul className="le-assets" aria-label="사진함">
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
          <legend>대체 글 <span className="fine">사진을 볼 수 없는 사람에게 읽어 줍니다</span></legend>
          {langs.map((l) => (
            <label key={l}>{LANG_LABEL[l]}
              <input value={alt?.[l] ?? ''} lang={l} onFocus={onAltFocus} onChange={(e) => onAlt(picker.altPath!, l, e.target.value)} />
            </label>
          ))}
        </fieldset>
      )}
      <div className="form-actions">
        {picker.mode === 'set' && picker.optional && current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick('')}>사진 빼기</button>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.close()}>다 했어요</button>
      </div>
    </dialog>
  );
}
