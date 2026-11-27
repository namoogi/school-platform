'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/Field';
import { templateText } from '@/lib/site-labels';
import { useI18n } from '@/components/I18nProvider';

/** 사이트 설정 요약(디자인 함께 바꾸기 안내에 씀) */
export type SiteState = { exists: boolean; open: boolean; theme: string | null; themeName: string | null };

/** 89차(ADR 0034): '디자인도 함께 바꾸기' 고르기 — 홈페이지가 열려 있으면 바로 보인다는 것을 알리고 기본은 끔 */
function DesignChoice({ site, designName, value, onChange }: { site: SiteState; designName: string; value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n();
  if (!site.exists) return <p className="fine">{t('site.tpl.design.noSite', { name: designName })}</p>;
  return (
    <div className="stack">
      <label className="radio"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} data-testid="template-design" /> {t('site.tpl.design.toggle', { name: designName })}</label>
      <p className="fine">{site.open
        ? t('site.tpl.design.openNote', { current: site.themeName ?? site.theme ?? '' })
        : t('site.tpl.design.closedNote', { current: site.themeName ?? site.theme ?? '' })}</p>
    </div>
  );
}

/** 65차(ADR 0031): 템플릿 적용 — 없는 쪽만 시안으로 만들고, 이미 있는 쪽은 건너뛴다. 89차: 디자인(화면 모양)도 함께 */
export function ApplyTemplate({ templateKey, name, existing, site, designName }: { templateKey: string; name: string; existing: string[]; site: SiteState; designName: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [design, setDesign] = useState(site.exists && !site.open);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function apply() {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/site/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: templateKey, design }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: body.error ?? t('site.tpl.apply.failed'), error: true });
    setMsg({ text: t('site.tpl.apply.done', {
      n: body.created.length,
      skipped: body.skipped.length ? t('site.tpl.apply.skipped', { pages: body.skipped.join('·') }) : '',
      design: body.design === 'applied' ? t('site.tpl.apply.designDone', { name: designName }) : '',
    }) });
    router.refresh();
  }
  return (
    <div className="stack">
      {existing.length > 0 && <p className="fine">{t('site.tpl.apply.existing', { pages: existing.join('·') })}</p>}
      <DesignChoice site={site} designName={designName} value={design} onChange={setDesign} />
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={apply} disabled={busy} data-testid="template-apply">{t('site.tpl.apply.start', { name })}</button>
      </div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && <> <a href="/site?box=page">{t('site.tpl.toPages')}</a></>}</p>}
    </div>
  );
}

type Proposal = { slotId: string; page: string; label: string; kind: string; value: string | { title: string; body: string }[];
  source: { file: string; heading: string | null; excerpt: string } | null; confidence: 'high' | 'low' };
type ProposeResult = { notes: { file: string; ok: boolean; note: string }[]; proposals: Proposal[]; missingPages: string[]; unfilled: { id: string; label: string; hint: string }[] };

/** 66차(ADR 0031): 학교 자료로 빈 칸 채우기 — 자료 읽기 → 제안 확인·고치기 → 고른 것만 새 시안 판으로. 자료 파일은 저장하지 않는다 */
export function AutofillPanel({ templateKey }: { templateKey: string }) {
  const router = useRouter();
  const { t } = useI18n();
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
    if (!r.ok) return setMsg({ text: body.error ?? t('site.tpl.autofill.readFailed'), error: true });
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
    if (!r.ok) return setMsg({ text: body.error ?? t('site.tpl.autofill.applyFailed'), error: true });
    const n = (body.result as { filled: string[] }[]).reduce((a, x) => a + x.filled.length, 0);
    const kept = (body.result as { kept: string[] }[]).reduce((a, x) => a + x.kept.length, 0);
    setMsg({ text: t('site.tpl.autofill.done', { n, kept: kept ? t('site.tpl.autofill.kept', { n: kept }) : '' }) });
    setRes(null); router.refresh();
  }
  return (
    <section className="stack" data-testid="autofill-panel" aria-label={t('site.tpl.autofill.title')}>
      <h2>{t('site.tpl.autofill.title')}</h2>
      <p className="fine">{t('site.tpl.autofill.intro')}</p>
      <label>{t('site.tpl.autofill.files')}<input type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} data-testid="autofill-files" /></label>
      <div className="form-actions"><button type="button" className="btn" disabled={busy || !files.length} onClick={read} data-testid="autofill-read">{t('site.tpl.autofill.read')}</button></div>
      {res && (
        <div className="stack">
          {res.notes.filter((n) => !n.ok).map((n) => <p key={n.file} className="alert">{n.file}: {n.note}</p>)}
          {res.missingPages.length > 0 && <p className="fine">{t('site.tpl.autofill.missingPages', { pages: res.missingPages.join('·') })}</p>}
          {res.proposals.length === 0 ? <p className="muted">{t('site.tpl.autofill.noMatch')}</p> : (
            <ul className="issue-list" data-testid="autofill-proposals">{res.proposals.map((p) => (
              <li key={p.slotId} className="autofill-item">
                <label className="radio"><input type="checkbox" checked={!!pick[p.slotId]} onChange={(e) => setPick({ ...pick, [p.slotId]: e.target.checked })} /><strong>{p.label}</strong></label>
                <small className="muted">{p.page} · {p.confidence === 'high' ? t('site.tpl.prop.byHeading') : t('site.tpl.prop.byWords')}{p.source?.file ? ` · ${p.source.file}${p.source.heading ? ` › ${p.source.heading}` : ''}` : ''}</small>
                {Array.isArray(p.value)
                  ? <ul className="fine">{p.value.map((i, k) => <li key={k}>{i.title}{i.body ? ` — ${i.body}` : ''}</li>)}</ul>
                  : p.kind === 'image' ? <small className="muted">{t('site.tpl.prop.image', { name: p.source?.excerpt ?? '' })}</small>
                  : <textarea rows={2} value={edit[p.slotId] ?? ''} onChange={(e) => setEdit({ ...edit, [p.slotId]: e.target.value })} aria-label={t('site.tpl.prop.content', { label: p.label })} />}
              </li>
            ))}</ul>
          )}
          {res.unfilled.length > 0 && <p className="fine">{t('site.tpl.autofill.unfilled', { labels: res.unfilled.map((u) => u.label).join(' · ') })}</p>}
          {res.proposals.length > 0 && <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy || !Object.values(pick).some(Boolean)} onClick={apply} data-testid="autofill-apply">{t('site.tpl.prop.apply')}</button></div>}
        </div>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && <> <a href="/site?box=page">{t('site.tpl.toPages')}</a></>}</p>}
      <details><summary>{t('site.tpl.autofill.agent')}</summary>
        <p className="fine">{t('site.tpl.autofill.agentHelp')}</p>
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
  const { t } = useI18n();
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
    if (!r.ok) throw new Error(data.error ?? t('common.failed'));
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
      setMsg({ text: t('site.tpl.migrate.imagesDone', { n: data.imported.length, failed: data.failed.length ? t('site.tpl.migrate.imagesFailed', { n: data.failed.length }) : '' }) });
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
      setMsg({ text: t('site.tpl.migrate.done', { n }) });
      setRes(null); router.refresh();
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  return (
    <section className="stack" data-testid="migrate-panel" aria-label={t('site.tpl.migrate.title')}>
      <h2>{t('site.tpl.migrate.title')}</h2>
      <p className="fine">{t('site.tpl.migrate.intro')}</p>
      <form className="row-wrap" onSubmit={read}>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://our-school.example" aria-label={t('site.tpl.migrate.url')} required data-testid="migrate-url" />
        <button type="submit" className="btn" disabled={busy || !url} data-testid="migrate-read">{busy ? t('site.tpl.migrate.reading') : t('site.tpl.migrate.read')}</button>
      </form>
      {res && (
        <div className="stack">
          <p className="fine">{t('site.tpl.migrate.pagesRead', { n: res.pages.length, pages: res.pages.map((p) => p.title || new URL(p.url).pathname).join(' · '), skipped: res.skipped.length ? t('site.tpl.migrate.skipped', { n: res.skipped.length }) : '' })}</p>
          {res.proposals.length === 0 ? <p className="muted">{t('site.tpl.migrate.noMatch')}</p> : (
            <ul className="issue-list" data-testid="migrate-proposals">{res.proposals.map((p) => (
              <li key={p.slotId} className="autofill-item">
                <label className="radio"><input type="checkbox" checked={!!pick[p.slotId]} onChange={(e) => setPick({ ...pick, [p.slotId]: e.target.checked })} /><strong>{p.label}</strong></label>
                <small className="muted">{p.page} · {p.confidence === 'high' ? t('site.tpl.prop.byHeading') : t('site.tpl.prop.check')}{p.source?.file ? ` · ${p.source.file}${p.source.heading ? ` › ${p.source.heading}` : ''}` : ''}</small>
                {Array.isArray(p.value) ? <ul className="fine">{p.value.map((i, k) => <li key={k}>{i.title}{i.body ? ` — ${i.body}` : ''}</li>)}</ul>
                  : p.kind === 'image' ? <small className="muted">{t('site.tpl.prop.image', { name: p.source?.excerpt ?? '' })}</small>
                  : <textarea rows={2} value={edit[p.slotId] ?? ''} onChange={(e) => setEdit({ ...edit, [p.slotId]: e.target.value })} aria-label={t('site.tpl.prop.content', { label: p.label })} />}
              </li>
            ))}</ul>
          )}
          {res.images.length > 0 && res.imageSlots.length > 0 && (
            <details><summary>{t('site.tpl.migrate.pickImages', { n: res.images.length })}</summary>
              <ul className="issue-list">{res.images.map((i) => (
                <li key={i.src}><label className="radio"><input type="checkbox" checked={!!imgPick[i.src]} onChange={(e) => setImgPick({ ...imgPick, [i.src]: e.target.checked })} />{i.alt || new URL(i.src).pathname.split('/').pop()}</label></li>
              ))}</ul>
              <p className="fine">{t('site.tpl.migrate.consent')}</p>
              <div className="form-actions"><button type="button" className="btn" disabled={busy || !Object.values(imgPick).some(Boolean)} onClick={importImages}>{t('site.tpl.migrate.importImages')}</button></div>
            </details>
          )}
          {res.proposals.length > 0 && <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy || !Object.values(pick).some(Boolean)} onClick={apply} data-testid="migrate-apply">{t('site.tpl.prop.apply')}</button></div>}
        </div>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && !res && <> <a href="/site?box=page">{t('site.tpl.toPages')}</a></>}</p>}
    </section>
  );
}


/**
 * 87차(사용자 지시 2026-11-27): 주소만 넣어 시작하는 이관 — 읽기 → 맞는 템플릿 추천(바꿀 수 있음) → 칸 제안 확인 →
 * '새 디자인으로 옮기기' = 템플릿 시작(없는 쪽만 시안) + 고른 제안 넣기(새 시안 판). 기존 두 경로(/api/site/templates, autofill/apply)를 차례로 쓴다.
 * 공개하지 않는다. 그림을 새로 그리는 일은 학교 AI(Codex 등)가 작업 토큰으로 한다(아래 '학교 AI에게 맡길 글').
 */
export function MigrateStart({ templates, site }: { templates: { key: string; name: string; summary: string; designName: string }[]; site: SiteState }) {
  const router = useRouter();
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(MigrateResult & { template: string; fits: Fit[]; byTemplate: Record<string, TemplateProposals> }) | null>(null);
  const [key, setKey] = useState('');
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean; done?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [design, setDesign] = useState(site.exists && !site.open);
  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? t('common.failed'));
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
  const name = templates.find((x) => x.key === key)?.name ?? key;
  async function move() {
    if (!res || !tp) return;
    setBusy(true); setMsg(null);
    try {
      const applied = await post('/api/site/templates', { key, design });
      const fills = tp.proposals.filter((p) => pick[p.slotId] && p.kind !== 'image').map((p) => ({ slotId: p.slotId, value: typeof p.value === 'string' ? (edit[p.slotId] ?? p.value) : p.value }));
      let n = 0;
      if (fills.length) {
        const body = await post('/api/site/templates/autofill/apply', { key, fills });
        n = (body.result as { filled: string[] }[]).reduce((a, x) => a + x.filled.length, 0);
      }
      setMsg({ done: true, text: t('site.tpl.start.done', {
        name, pages: applied.created.length, n,
        skipped: applied.skipped.length ? t('site.tpl.start.skipped', { pages: applied.skipped.join('·') }) : '',
        design: applied.design === 'applied' ? t('site.tpl.start.designDone') : '',
      }) });
      router.refresh();
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
    finally { setBusy(false); }
  }
  // 남은 일 = 제안이 없던 칸 + 제안했지만 고르지 않은 칸(옮기기에서 빠짐)
  const remaining = tp ? [...tp.unfilled, ...tp.proposals.filter((p) => p.kind !== 'image' && !pick[p.slotId]).map((p) => ({ id: p.slotId, label: p.label, hint: t('site.tpl.start.notMoved') }))] : [];
  const agentText = res && tp ? [
    t('site.tpl.agent.intro', { name, start: res.start }),
    t('site.tpl.agent.token'),
    t('site.tpl.agent.docs'),
    '',
    t('site.tpl.agent.todo'),
    ...(remaining.length ? [t('site.tpl.agent.fill', { n: res.pages.length, slots: remaining.map((u) => `${u.label}(${u.hint})`).join(', ') })] : [t('site.tpl.agent.check')]),
    ...(tp.imageSlots.length ? [t('site.tpl.agent.images', { slots: tp.imageSlots.map((s) => t('site.tpl.agent.imageSlot', { label: s.label, page: s.page })).join(', ') })] : []),
    t('site.tpl.agent.report', { step: tp.imageSlots.length ? 3 : 2 }),
  ].join('\n') : '';
  return (
    <section className="card stack" data-testid="migrate-start" aria-labelledby="migrate-start-title">
      <h2 id="migrate-start-title">{t('site.tpl.start.title')}</h2>
      <p className="fine">{t('site.tpl.start.intro')}</p>
      <form className="stack" onSubmit={read}>
        <Field label={t('site.tpl.migrate.url')} required hint={t('site.tpl.start.urlHint')}>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://our-school.example" data-testid="migrate-start-url" />
        </Field>
        <div className="form-actions"><button type="submit" className="btn" disabled={busy || !url} data-testid="migrate-start-read">{busy && !res ? t('site.tpl.migrate.reading') : t('site.tpl.start.read')}</button></div>
      </form>
      {res && tp && (
        <div className="stack">
          <p className="fine">{t('site.tpl.migrate.pagesRead', { n: res.pages.length, pages: res.pages.map((p) => p.title || new URL(p.url).pathname).join(' · '), skipped: res.skipped.length ? t('site.tpl.migrate.skipped', { n: res.skipped.length }) : '' })}</p>
          <fieldset className="stack migrate-fits">
            <legend>{t('site.tpl.start.pick')}</legend>
            {res.fits.map((f, i) => (
              <label key={f.key} className="radio migrate-fit">
                <input type="radio" name="migrate-template" value={f.key} checked={key === f.key} onChange={() => choose(f.key)} data-testid={`migrate-fit-${f.key}`} />
                <img src={`/site-templates/${f.key}.jpg`} alt="" width={96} height={60} />
                <span><strong>{templateText(t, f.key, 'name', f.name)}</strong>{i === 0 && <span className="badge" data-tone="success"> {t('cc.recommended')}</span>}<br />
                  <small className="muted">{t('site.tpl.start.fillable', { n: f.filled })}{f.reasons.length ? t('site.tpl.start.clues', { clues: f.reasons.join(', ') }) : ''} · <a href={`/site/templates/${f.key}`} target="_blank" rel="noreferrer">{t('site.tpl.preview')}</a></small></span>
              </label>
            ))}
          </fieldset>
          <h3>{t('site.tpl.start.content', { name })}</h3>
          {tp.proposals.filter((p) => p.kind !== 'image').length === 0 ? <p className="muted">{t('site.tpl.start.noMatch')}</p> : (
            <ul className="issue-list" data-testid="migrate-start-proposals">{tp.proposals.filter((p) => p.kind !== 'image').map((p) => (
              <li key={p.slotId} className="autofill-item">
                <label className="radio"><input type="checkbox" checked={!!pick[p.slotId]} onChange={(e) => setPick({ ...pick, [p.slotId]: e.target.checked })} /><strong>{p.label}</strong></label>
                <small className="muted">{t('site.tpl.start.page', { page: p.page })} · {p.confidence === 'high' ? t('site.tpl.prop.byHeading') : t('site.tpl.prop.check')}{p.source?.file ? ` · ${p.source.file}` : ''}</small>
                {Array.isArray(p.value) ? <ul className="fine">{p.value.map((it, k) => <li key={k}>{it.title}{it.body ? ` — ${it.body}` : ''}</li>)}</ul>
                  : <textarea rows={2} value={edit[p.slotId] ?? ''} onChange={(e) => setEdit({ ...edit, [p.slotId]: e.target.value })} aria-label={t('site.tpl.prop.content', { label: p.label })} />}
              </li>
            ))}</ul>
          )}
          {remaining.length > 0 && <p className="fine">{t('site.tpl.start.remaining', { labels: remaining.map((u) => u.label).join(' · ') })}</p>}
          {res.images.length > 0 && <p className="fine">{t('site.tpl.start.images', { n: res.images.length, name })}</p>}
          <DesignChoice site={site} designName={templates.find((x) => x.key === key)?.designName ?? key} value={design} onChange={setDesign} />
          <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={move} data-testid="migrate-start-move">{t('site.tpl.start.move', { name })}</button></div>
          <details data-testid="migrate-agent">
            <summary>{t('site.tpl.agent.summary')}</summary>
            <p className="fine">{t('site.tpl.agent.help')}</p>
            <textarea readOnly rows={8} value={agentText} aria-label={t('site.tpl.agent.label')} />
            <div className="form-actions">
              <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(agentText); setCopied(true); } catch { setCopied(false); } }}>{t('site.tpl.agent.copy')}</button>
              <a className="btn btn-ghost" href="/site?box=settings">{t('site.tpl.agent.workspace')}</a>
              {copied && <span role="status" className="fine">{t('site.tpl.agent.copied')}</span>}
            </div>
          </details>
        </div>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{msg.done && <> <a href="/site?box=page">{t('site.tpl.toPages')}</a> · <a href={`/site/templates/${key}`}>{t('site.tpl.start.previewImages', { name })}</a></>}</p>}
    </section>
  );
}
