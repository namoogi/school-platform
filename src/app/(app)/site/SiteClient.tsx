'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Eye, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { BLOCK_LABEL, KIND_LABEL, LANG_LABEL, LANGS, type Block, type Content, type EntryKind, type Lang, type LText, type SiteSettings } from '@/lib/site-shared';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '저장하지 못했습니다.');
  return data;
}

// ── 설정 ─────────────────────────────────────────────────
export function SiteSettingsForm({ initial, schoolName }: { initial: SiteSettings | null; schoolName: string }) {
  const router = useRouter();
  const [s, setS] = useState({
    public_slug: initial?.public_slug ?? '', langs: (initial?.langs ?? ['ko']) as Lang[], default_lang: (initial?.default_lang ?? 'ko') as Lang,
    theme: initial?.theme ?? 'campus', site_title: (initial?.site_title ?? { ko: schoolName }) as LText, is_open: initial?.is_open ?? false,
  });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await send('/api/site/settings', 'POST', s); setMsg({ tone: 'success', text: '저장했습니다.' }); router.refresh(); }
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
      <label className="radio"><input type="checkbox" checked={s.is_open} onChange={(e) => setS({ ...s, is_open: e.target.checked })} /> 홈페이지 열기 (방문자가 공개한 판을 볼 수 있음)</label>
      {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary">설정 저장</button></div>
    </form>
  );
}

// ── 새 항목 ──────────────────────────────────────────────
export function NewEntryForm({ kind, disabled }: { kind: EntryKind; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
type Asset = { id: string; name: string };
const NEW_BLOCK: Record<Block['type'], () => Block> = {
  heading: () => ({ type: 'heading', text: {} }), text: () => ({ type: 'text', text: {} }), notice: () => ({ type: 'notice', text: {} }),
  image: () => ({ type: 'image', asset: '', alt: {} }), gallery: () => ({ type: 'gallery', assets: [] }),
  video: () => ({ type: 'video', url: {} }), story_page: () => ({ type: 'story_page', text: {} }),
};
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

function AssetPick({ value, onChange, assets, onUploaded, label }: { value?: string; onChange: (id: string) => void; assets: Asset[]; onUploaded: (a: Asset) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true); setErr(null);
    const form = new FormData(); form.append('file', file);
    const res = await fetch('/api/site/assets', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? '올리지 못했습니다.');
    onUploaded({ id: data.id, name: file.name }); onChange(data.id);
  }
  return (
    <div className="asset-pick">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value ? <img src={`/site/assets/${value}`} alt="" /> : <span className="asset-empty" aria-hidden="true"><ImagePlus size={20} /></span>}
      <div>
        <label>{label}
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">고르지 않음</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="fine">새 그림 올리기 (PNG·JPG·WEBP·GIF, 5MB 이하)
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {err && <span className="ui-error" role="alert">{err}</span>}
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
  // 새 판이 생기면(저장·공개 후 새로 고침) 입력을 그 판으로 맞춘다. 다시 마운트하지 않아야 결과 안내가 남는다.
  const [shownId, setShownId] = useState(latest.id);
  if (shownId !== latest.id) { setShownId(latest.id); setContent(structuredClone(latest.content)); setNote(''); }
  const dirty = JSON.stringify(content) !== JSON.stringify(latest.content);
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
  const save = () => run(() => send(`/api/site/entries/${detail.entry.id}/versions`, 'POST', { content, note }), '새 판으로 저장했습니다.');
  const publishLatest = () => run(async () => {
    if (dirty) await send(`/api/site/entries/${detail.entry.id}/versions`, 'POST', { content, note });
    await send(`/api/site/entries/${detail.entry.id}/publish`, 'POST', {});
  }, '공개했습니다.');

  return (
    <div className="site-editor" data-testid="entry-editor">
      <div className="card">
        <div className="between">
          <div>
            <p className="fine">{KIND_LABEL[detail.entry.kind]} · /{detail.entry.key} · 최신 {latest.version}판{live ? ` · 공개 중 ${live.version}판` : ' · 공개 안 함'}</p>
            <h2>{content.title[langs[0]] || content.title.ko || detail.entry.key}</h2>
          </div>
          <div className="actions">
            <Link className="btn btn-ghost btn-sm" href={`/site/preview/${detail.entry.id}`} target="_blank"><Eye size={16} aria-hidden="true" />시안 미리보기</Link>
            {publicHref && live && <Link className="btn btn-ghost btn-sm" href={publicHref} target="_blank">공개본 보기</Link>}
          </div>
        </div>
        {isStory && detail.entry.meta.virtue && <p className="fine">성품: {detail.entry.meta.virtue}{detail.entry.meta.character ? ` · 주인공: ${detail.entry.meta.character}` : ''}</p>}
        <LangFields label="제목" value={content.title} langs={langs} onChange={(title) => setContent({ ...content, title })} />
        <LangFields label="요약" value={content.summary} langs={langs} multiline onChange={(summary) => setContent({ ...content, summary })} />
        <AssetPick label="표지 그림" value={content.cover} assets={assets} onUploaded={uploaded} onChange={(cover) => setContent({ ...content, cover: cover || undefined })} />
      </div>

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
            {b.type === 'text' && <LangFields label="글" value={b.text} langs={langs} multiline onChange={(text) => setBlock(i, { ...b, text })} />}
            {b.type === 'image' && <>
              <AssetPick label="그림" value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset })} />
              <LangFields label="대체 글" value={b.alt} langs={langs} onChange={(alt) => setBlock(i, { ...b, alt })} />
            </>}
            {b.type === 'gallery' && <>
              <div className="gallery-pick">{b.assets.map((a, k) => (
                <span key={a + k}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/site/assets/${a}`} alt="" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlock(i, { ...b, assets: b.assets.filter((_, j) => j !== k) })}>빼기</button></span>))}</div>
              <AssetPick label="사진 더하기" assets={assets} onUploaded={uploaded} onChange={(a) => a && setBlock(i, { ...b, assets: [...b.assets, a] })} />
            </>}
            {b.type === 'video' && <LangFields label="영상 주소 (YouTube·Vimeo·Google Drive)" value={b.url} langs={langs} onChange={(url) => setBlock(i, { ...b, url })} />}
            {b.type === 'story_page' && <>
              <AssetPick label="쪽 그림" value={b.asset} assets={assets} onUploaded={uploaded} onChange={(asset) => setBlock(i, { ...b, asset: asset || undefined })} />
              <LangFields label="쪽 글" value={b.text} langs={langs} multiline onChange={(text) => setBlock(i, { ...b, text })} />
            </>}
          </li>
        ))}
      </ol>
      <div className="block-add" role="group" aria-label="블록 더하기">
        {(isStory ? (['story_page', 'video', 'text'] as const) : (['heading', 'text', 'image', 'gallery', 'notice', 'video'] as const)).map((t) => (
          <button key={t} type="button" className="btn btn-secondary btn-sm" onClick={() => add(t)}><Plus size={14} aria-hidden="true" />{BLOCK_LABEL[t]}</button>
        ))}
      </div>

      <div className="card site-save">
        <label>이번 판 메모 (선택)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 태국어 글 다듬음" /></label>
        {msg && <p className="banner" data-tone={msg.tone} role="status">{msg.text}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={save} disabled={busy || !dirty}>새 판으로 저장</button>
          {canPublish && <button type="button" className="btn btn-primary" onClick={publishLatest} disabled={busy || (!dirty && live?.id === latest.id)}>{dirty ? '저장하고 공개' : '최신 판 공개'}</button>}
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
