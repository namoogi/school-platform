'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 65차(ADR 0031): 템플릿 적용 — 없는 쪽만 시안으로 만들고, 이미 있는 쪽은 건너뛴다 */
export function ApplyTemplate({ templateKey, name, existing }: { templateKey: string; name: string; existing: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function apply() {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/site/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: templateKey }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: body.error ?? '적용하지 못했습니다.', error: true });
    setMsg({ text: `시안 쪽 ${body.created.length}개를 만들었습니다${body.skipped.length ? ` (이미 있는 ${body.skipped.join('·')}는 그대로 둠)` : ''}. 공개 전에 내용을 채워 주세요.` });
    router.refresh();
  }
  return (
    <div className="stack">
      {existing.length > 0 && <p className="fine">이미 있는 쪽({existing.join('·')})은 건드리지 않고 나머지 쪽만 만듭니다.</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={apply} disabled={busy} data-testid="template-apply">‘{name}’으로 시작하기</button>
      </div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && <> <a href="/site?box=page">쪽 목록으로</a></>}</p>}
    </div>
  );
}

type Proposal = { slotId: string; page: string; label: string; kind: string; value: string | { title: string; body: string }[];
  source: { file: string; heading: string | null; excerpt: string } | null; confidence: 'high' | 'low' };
type ProposeResult = { notes: { file: string; ok: boolean; note: string }[]; proposals: Proposal[]; missingPages: string[]; unfilled: { id: string; label: string; hint: string }[] };

/** 66차(ADR 0031): 학교 자료로 빈 칸 채우기 — 자료 읽기 → 제안 확인·고치기 → 고른 것만 새 시안 판으로. 자료 파일은 저장하지 않는다 */
export function AutofillPanel({ templateKey }: { templateKey: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ProposeResult | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function read() {
    setBusy(true); setMsg(null); setRes(null);
    const fd = new FormData();
    fd.set('key', templateKey);
    files.forEach((f) => fd.append('files', f));
    const r = await fetch('/api/site/templates/autofill', { method: 'POST', body: fd });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ text: body.error ?? '자료를 읽지 못했습니다.', error: true });
    setRes(body);
    setPick(Object.fromEntries((body as ProposeResult).proposals.map((p) => [p.slotId, p.confidence === 'high'])));
    setEdit(Object.fromEntries((body as ProposeResult).proposals.filter((p) => typeof p.value === 'string' && p.kind !== 'image').map((p) => [p.slotId, p.value as string])));
  }
  async function apply() {
    if (!res) return;
    const fills = res.proposals.filter((p) => pick[p.slotId]).map((p) => ({ slotId: p.slotId, value: typeof p.value === 'string' && p.kind !== 'image' ? (edit[p.slotId] ?? p.value) : p.value }));
    setBusy(true);
    const r = await fetch('/api/site/templates/autofill/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: templateKey, fills }) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ text: body.error ?? '넣지 못했습니다.', error: true });
    const n = (body.result as { filled: string[] }[]).reduce((a, x) => a + x.filled.length, 0);
    const kept = (body.result as { kept: string[] }[]).reduce((a, x) => a + x.kept.length, 0);
    setMsg({ text: `${n}칸을 채워 새 시안 판을 만들었습니다${kept ? ` (이미 학교가 쓴 ${kept}칸은 그대로)` : ''}. 공개 전에 쪽 목록에서 확인해 주세요.` });
    setRes(null); router.refresh();
  }
  return (
    <section className="stack" data-testid="autofill-panel" aria-label="학교 자료로 채우기">
      <h2>학교 자료로 채우기</h2>
      <p className="fine">학교 소개서·안내문(PDF·DOCX·TXT)을 올리면 칸마다 맞는 부분을 찾아 제안합니다(낱말 단서로 찾는 규칙 기반 1차 배치). 확인한 것만 새 시안 판으로 넣고, 학교가 이미 쓴 칸은 건드리지 않습니다. 사진 칸은 홈페이지에 올린 그림에서 고릅니다.</p>
      <label>자료 파일<input type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} data-testid="autofill-files" /></label>
      <div className="form-actions"><button type="button" className="btn" disabled={busy || !files.length} onClick={read} data-testid="autofill-read">자료 읽기</button></div>
      {res && (
        <div className="stack">
          {res.notes.filter((n) => !n.ok).map((n) => <p key={n.file} className="alert">{n.file}: {n.note}</p>)}
          {res.missingPages.length > 0 && <p className="fine">아직 없는 쪽({res.missingPages.join('·')})의 칸은 넣지 못합니다. 먼저 템플릿으로 시작하세요.</p>}
          {res.proposals.length === 0 ? <p className="muted">맞는 부분을 찾지 못했습니다. 칸을 직접 채우거나 학교 AI에게 맡겨 보세요.</p> : (
            <ul className="issue-list" data-testid="autofill-proposals">{res.proposals.map((p) => (
              <li key={p.slotId} className="autofill-item">
                <label className="radio"><input type="checkbox" checked={!!pick[p.slotId]} onChange={(e) => setPick({ ...pick, [p.slotId]: e.target.checked })} /><strong>{p.label}</strong></label>
                <small className="muted">{p.page} · {p.confidence === 'high' ? '제목으로 찾음' : '본문 낱말로 찾음(확인 필요)'}{p.source?.file ? ` · ${p.source.file}${p.source.heading ? ` › ${p.source.heading}` : ''}` : ''}</small>
                {Array.isArray(p.value)
                  ? <ul className="fine">{p.value.map((i, k) => <li key={k}>{i.title}{i.body ? ` — ${i.body}` : ''}</li>)}</ul>
                  : p.kind === 'image' ? <small className="muted">그림: {p.source?.excerpt}</small>
                  : <textarea rows={2} value={edit[p.slotId] ?? ''} onChange={(e) => setEdit({ ...edit, [p.slotId]: e.target.value })} aria-label={`${p.label} 내용`} />}
              </li>
            ))}</ul>
          )}
          {res.unfilled.length > 0 && <p className="fine">못 찾은 칸: {res.unfilled.map((u) => u.label).join(' · ')}</p>}
          {res.proposals.length > 0 && <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy || !Object.values(pick).some(Boolean)} onClick={apply} data-testid="autofill-apply">고른 것 넣기</button></div>}
        </div>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && <> <a href="/site?box=page">쪽 목록으로</a></>}</p>}
      <details><summary>학교 AI에게 맡기기</summary>
        <p className="fine">홈페이지 → 설정 → AI 작업 공간에서 &lsquo;쪽&rsquo; 종류(읽기·고치기)로 토큰을 발급해 학교 AI에 연결 글을 붙여 넣고, &ldquo;템플릿 빈 칸을 학교 자료로 채워 줘&rdquo;라고 맡기면 됩니다. 학교 AI는 GET /api/agent/templates로 빈 칸 안내를 읽고 쪽 새 판(시안)을 저장합니다.</p>
      </details>
    </section>
  );
}

type MigrateResult = { start: string; pages: { url: string; title: string }[]; skipped: { url: string; why: string }[]; proposals: Proposal[];
  images: { src: string; alt: string }[]; unfilled: { id: string; label: string }[]; imageSlots: { slotId: string; page: string; label: string }[] };

/** 67차(ADR 0031): 기존 홈페이지에서 옮기기 — 주소 → 같은 사이트 쪽 읽기 → 빈 칸 제안(고치기·고르기) → 넣기. 그림은 고른 것만 가져온다 */
export function MigratePanel({ templateKey }: { templateKey: string }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MigrateResult | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [imgPick, setImgPick] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
    return data;
  };
  async function read(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setRes(null);
    try {
      const data: MigrateResult = await post('/api/site/templates/migrate', { key: templateKey, url });
      setRes(data);
      setPick(Object.fromEntries(data.proposals.filter((p) => p.kind !== 'image').map((p) => [p.slotId, p.confidence === 'high'])));
      setEdit(Object.fromEntries(data.proposals.filter((p) => typeof p.value === 'string' && p.kind !== 'image').map((p) => [p.slotId, p.value as string])));
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  async function importImages() {
    if (!res) return;
    const urls = res.images.filter((i) => imgPick[i.src]).map((i) => i.src).slice(0, 10);
    setBusy(true);
    try {
      const data: { imported: { url: string; id: string; name: string }[]; failed: { url: string; why: string }[] } = await post('/api/site/templates/migrate/images', { urls });
      // 가져온 그림을 사진 칸 제안으로 차례대로 놓는다(고르기는 사람이)
      const imgs = [...data.imported];
      const others = res.proposals.filter((p) => p.kind !== 'image');
      const imageProps: Proposal[] = res.imageSlots.flatMap((s) => { const i = imgs.shift(); return i ? [{ slotId: s.slotId, page: s.page, label: s.label, kind: 'image', value: i.id, source: { file: i.name, heading: null, excerpt: i.name }, confidence: 'low' as const }] : []; });
      setRes({ ...res, proposals: [...others, ...imageProps] });
      setPick({ ...pick, ...Object.fromEntries(imageProps.map((p) => [p.slotId, true])) });
      setMsg({ text: `그림 ${data.imported.length}장을 홈페이지 그림으로 가져왔습니다${data.failed.length ? ` (${data.failed.length}장 실패)` : ''}.` });
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!res) return;
    const fills = res.proposals.filter((p) => pick[p.slotId]).map((p) => ({ slotId: p.slotId, value: typeof p.value === 'string' && p.kind !== 'image' ? (edit[p.slotId] ?? p.value) : p.value }));
    setBusy(true);
    try {
      const body = await post('/api/site/templates/autofill/apply', { key: templateKey, fills });
      const n = (body.result as { filled: string[] }[]).reduce((a, x) => a + x.filled.length, 0);
      setMsg({ text: `옛 사이트 내용으로 ${n}칸을 채워 새 시안 판을 만들었습니다. 공개 전에 쪽 목록에서 확인해 주세요.` });
      setRes(null); router.refresh();
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  return (
    <section className="stack" data-testid="migrate-panel" aria-label="기존 홈페이지에서 옮기기">
      <h2>기존 홈페이지에서 옮기기</h2>
      <p className="fine">지금 쓰는 학교 홈페이지 주소를 적으면 같은 사이트 안의 쪽을 8개까지 읽어 칸마다 제안합니다. 공개된 쪽만 읽고, 사이트의 robots.txt를 따릅니다. 확인한 것만 새 시안 판으로 넣고, 그림은 고른 것만 가져옵니다.</p>
      <form className="row-wrap" onSubmit={read}>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://our-school.example" aria-label="기존 홈페이지 주소" required data-testid="migrate-url" />
        <button type="submit" className="btn" disabled={busy || !url} data-testid="migrate-read">{busy ? '읽는 중…' : '읽기'}</button>
      </form>
      {res && (
        <div className="stack">
          <p className="fine">읽은 쪽 {res.pages.length}개: {res.pages.map((p) => p.title || new URL(p.url).pathname).join(' · ')}{res.skipped.length ? ` · 건너뜀 ${res.skipped.length}개` : ''}</p>
          {res.proposals.length === 0 ? <p className="muted">맞는 부분을 찾지 못했습니다.</p> : (
            <ul className="issue-list" data-testid="migrate-proposals">{res.proposals.map((p) => (
              <li key={p.slotId} className="autofill-item">
                <label className="radio"><input type="checkbox" checked={!!pick[p.slotId]} onChange={(e) => setPick({ ...pick, [p.slotId]: e.target.checked })} /><strong>{p.label}</strong></label>
                <small className="muted">{p.page} · {p.confidence === 'high' ? '제목으로 찾음' : '확인 필요'}{p.source?.file ? ` · ${p.source.file}${p.source.heading ? ` › ${p.source.heading}` : ''}` : ''}</small>
                {Array.isArray(p.value) ? <ul className="fine">{p.value.map((i, k) => <li key={k}>{i.title}{i.body ? ` — ${i.body}` : ''}</li>)}</ul>
                  : p.kind === 'image' ? <small className="muted">그림: {p.source?.excerpt}</small>
                  : <textarea rows={2} value={edit[p.slotId] ?? ''} onChange={(e) => setEdit({ ...edit, [p.slotId]: e.target.value })} aria-label={`${p.label} 내용`} />}
              </li>
            ))}</ul>
          )}
          {res.images.length > 0 && res.imageSlots.length > 0 && (
            <details><summary>옛 사이트 그림 {res.images.length}장에서 고르기</summary>
              <ul className="issue-list">{res.images.map((i) => (
                <li key={i.src}><label className="radio"><input type="checkbox" checked={!!imgPick[i.src]} onChange={(e) => setImgPick({ ...imgPick, [i.src]: e.target.checked })} />{i.alt || new URL(i.src).pathname.split('/').pop()}</label></li>
              ))}</ul>
              <p className="fine">학생이 나오는 사진은 학생·보호자 공개 허가를 받은 것만 가져옵니다.</p>
              <div className="form-actions"><button type="button" className="btn" disabled={busy || !Object.values(imgPick).some(Boolean)} onClick={importImages}>고른 그림 가져오기(10장까지)</button></div>
            </details>
          )}
          {res.proposals.length > 0 && <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy || !Object.values(pick).some(Boolean)} onClick={apply} data-testid="migrate-apply">고른 것 넣기</button></div>}
        </div>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && !res && <> <a href="/site?box=page">쪽 목록으로</a></>}</p>}
    </section>
  );
}
