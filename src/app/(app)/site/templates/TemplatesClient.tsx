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

type Fit = { key: string; name: string; score: number; filled: number; reasons: string[] };
type TemplateProposals = { proposals: Proposal[]; unfilled: { id: string; label: string; hint: string }[]; imageSlots: { slotId: string; page: string; label: string }[] };
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


/**
 * 87차(사용자 지시 2026-11-27): 주소만 넣어 시작하는 이관 — 읽기 → 맞는 템플릿 추천(바꿀 수 있음) → 칸 제안 확인 →
 * '새 디자인으로 옮기기' = 템플릿 시작(없는 쪽만 시안) + 고른 제안 넣기(새 시안 판). 기존 두 경로(/api/site/templates, autofill/apply)를 차례로 쓴다.
 * 공개하지 않는다. 그림을 새로 그리는 일은 학교 AI(Codex 등)가 작업 토큰으로 한다(아래 '학교 AI에게 맡길 글').
 */
export function MigrateStart({ templates }: { templates: { key: string; name: string; summary: string }[] }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(MigrateResult & { template: string; fits: Fit[]; byTemplate: Record<string, TemplateProposals> }) | null>(null);
  const [key, setKey] = useState('');
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean; done?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
    return data;
  };
  const choose = (k: string, data = res) => {
    if (!data) return;
    const tp = data.byTemplate[k];
    setKey(k);
    setPick(Object.fromEntries(tp.proposals.filter((p) => p.kind !== 'image').map((p) => [p.slotId, p.confidence === 'high'])));
    setEdit(Object.fromEntries(tp.proposals.filter((p) => typeof p.value === 'string' && p.kind !== 'image').map((p) => [p.slotId, p.value as string])));
  };
  async function read(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setRes(null);
    try {
      const data = await post('/api/site/templates/migrate', { url });
      setRes(data); choose(data.template, data);
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  const tp = res && key ? res.byTemplate[key] : null;
  const name = templates.find((t) => t.key === key)?.name ?? key;
  async function move() {
    if (!res || !tp) return;
    setBusy(true); setMsg(null);
    try {
      const applied = await post('/api/site/templates', { key });
      const fills = tp.proposals.filter((p) => pick[p.slotId] && p.kind !== 'image').map((p) => ({ slotId: p.slotId, value: typeof p.value === 'string' ? (edit[p.slotId] ?? p.value) : p.value }));
      let n = 0;
      if (fills.length) {
        const body = await post('/api/site/templates/autofill/apply', { key, fills });
        n = (body.result as { filled: string[] }[]).reduce((a, x) => a + x.filled.length, 0);
      }
      setMsg({ done: true, text: `‘${name}’ 디자인으로 시안 쪽 ${applied.created.length}개를 만들고 옛 사이트 내용으로 ${n}칸을 채웠습니다${applied.skipped.length ? ` (이미 있는 ${applied.skipped.join('·')} 쪽은 그대로 둠)` : ''}. 아직 공개되지 않았습니다.` });
      router.refresh();
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  const agentText = res && tp ? [
    `우리 학교 홈페이지를 '${name}' 템플릿(새 디자인)으로 옮기는 중입니다. 옛 사이트: ${res.start}`,
    `학교 관리자가 'AI 작업 공간'에서 발급한 작업 토큰(종류 page, 권한 read·upload·edit)으로만 일하고, 공개하지 마세요(사람이 확인 뒤 공개합니다).`,
    `안내: 저장소 문서 docs/agents/site-migrate.md 와 docs/agents/README.md(API).`,
    '',
    '할 일',
    ...(tp.unfilled.length ? [`1. 아직 못 채운 칸을 옛 사이트(${res.pages.length}쪽 읽음)에서 찾아 채운 새 판을 저장: ${tp.unfilled.map((u) => `${u.label}(${u.hint})`).join(', ')}`] : ['1. 채운 칸을 옛 사이트와 대조해 틀린 곳을 고친 새 판을 저장']),
    ...(tp.imageSlots.length ? [`2. 사진 칸: ${tp.imageSlots.map((s) => `${s.label}(${s.page} 쪽)`).join(', ')} — 옛 사이트 사진 가운데 학교가 권리를 가진 것을 쓰거나, 실제 사람 얼굴이 없는 삽화를 만들어 POST /api/agent/assets 로 올리고 그 쪽 새 판에 넣기`] : []),
    `${tp.imageSlots.length ? 3 : 2}. 남은 [ ] 안내 자리 목록과 확인이 필요한 사실(학비·날짜·연락처)을 사람에게 보고`,
  ].join('\n') : '';
  return (
    <section className="card stack" data-testid="migrate-start" aria-labelledby="migrate-start-title">
      <h2 id="migrate-start-title">기존 홈페이지를 새 디자인으로 옮기기</h2>
      <p className="fine">지금 쓰는 홈페이지 주소를 넣으면 같은 사이트의 공개된 쪽을 8개까지 읽고(robots.txt를 따름), 내용에 맞는 템플릿을 추천합니다. 템플릿을 바꿔 볼 수 있고, 확인한 내용만 새 디자인의 시안으로 옮깁니다. 공개는 직접 합니다.</p>
      <form className="row-wrap" onSubmit={read}>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://our-school.example" aria-label="기존 홈페이지 주소" required data-testid="migrate-start-url" />
        <button type="submit" className="btn" disabled={busy || !url} data-testid="migrate-start-read">{busy && !res ? '읽는 중…' : '읽고 추천받기'}</button>
      </form>
      {res && tp && (
        <div className="stack">
          <p className="fine">읽은 쪽 {res.pages.length}개: {res.pages.map((p) => p.title || new URL(p.url).pathname).join(' · ')}{res.skipped.length ? ` · 건너뜀 ${res.skipped.length}개` : ''}</p>
          <fieldset className="stack migrate-fits">
            <legend>옮길 디자인(템플릿)</legend>
            {res.fits.map((f, i) => (
              <label key={f.key} className="radio migrate-fit">
                <input type="radio" name="migrate-template" value={f.key} checked={key === f.key} onChange={() => choose(f.key)} data-testid={`migrate-fit-${f.key}`} />
                <img src={`/site-templates/${f.key}.jpg`} alt="" width={96} height={60} />
                <span><strong>{f.name}</strong>{i === 0 && <span className="badge" data-tone="success"> 추천</span>}<br />
                  <small className="muted">채울 수 있는 칸 {f.filled}개{f.reasons.length ? ` · 찾은 단서: ${f.reasons.join(', ')}` : ''} · <a href={`/site/templates/${f.key}`} target="_blank" rel="noreferrer">미리보기</a></small></span>
              </label>
            ))}
          </fieldset>
          <h3>‘{name}’에 옮길 내용</h3>
          {tp.proposals.filter((p) => p.kind !== 'image').length === 0 ? <p className="muted">이 템플릿 칸에 맞는 내용을 찾지 못했습니다. 템플릿만 시작하고 학교 AI에게 맡길 수 있습니다.</p> : (
            <ul className="issue-list" data-testid="migrate-start-proposals">{tp.proposals.filter((p) => p.kind !== 'image').map((p) => (
              <li key={p.slotId} className="autofill-item">
                <label className="radio"><input type="checkbox" checked={!!pick[p.slotId]} onChange={(e) => setPick({ ...pick, [p.slotId]: e.target.checked })} /><strong>{p.label}</strong></label>
                <small className="muted">{p.page} 쪽 · {p.confidence === 'high' ? '제목으로 찾음' : '확인 필요'}{p.source?.file ? ` · ${p.source.file}` : ''}</small>
                {Array.isArray(p.value) ? <ul className="fine">{p.value.map((it, k) => <li key={k}>{it.title}{it.body ? ` — ${it.body}` : ''}</li>)}</ul>
                  : <textarea rows={2} value={edit[p.slotId] ?? ''} onChange={(e) => setEdit({ ...edit, [p.slotId]: e.target.value })} aria-label={`${p.label} 내용`} />}
              </li>
            ))}</ul>
          )}
          {tp.unfilled.length > 0 && <p className="fine">못 찾은 칸: {tp.unfilled.map((u) => u.label).join(' · ')} — 옮긴 뒤 직접 쓰거나 학교 AI에게 맡깁니다.</p>}
          {res.images.length > 0 && <p className="fine">옛 사이트 그림 {res.images.length}장은 옮긴 뒤 ‘{name}’ 미리보기 아래 ‘기존 홈페이지에서 옮기기’에서 골라 가져옵니다.</p>}
          <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={move} data-testid="migrate-start-move">‘{name}’ 디자인으로 옮기기</button></div>
          <details data-testid="migrate-agent">
            <summary>학교 AI(Codex·Claude Code)에게 맡길 글</summary>
            <p className="fine">못 찾은 칸 채우기, 사진 칸의 그림 만들기는 학교가 쓰는 AI 구독으로 합니다(플랫폼 비용 없음). 아래 글과 ‘AI 작업 공간’에서 발급한 작업 토큰을 함께 AI 대화창에 붙여 넣으세요. 토큰은 이 글에 들어 있지 않습니다.</p>
            <textarea readOnly rows={8} value={agentText} aria-label="학교 AI에게 맡길 글" />
            <div className="form-actions">
              <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(agentText); setCopied(true); } catch { setCopied(false); } }}>글 복사</button>
              <a className="btn btn-ghost" href="/site?box=settings">AI 작업 공간(토큰 발급)</a>
              {copied && <span role="status" className="fine">복사했습니다.</span>}
            </div>
          </details>
        </div>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{msg.done && <> <a href="/site?box=page">쪽 목록으로</a> · <a href={`/site/templates/${key}`}>‘{name}’ 미리보기·그림 가져오기</a></>}</p>}
    </section>
  );
}
