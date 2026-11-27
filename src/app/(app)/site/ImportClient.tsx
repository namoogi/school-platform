'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { unzip, strFromU8, type Unzipped } from 'fflate';
import { FileArchive, Upload } from 'lucide-react';
import { FileDrop } from '@/components/FileDrop';
import { useI18n } from '@/components/I18nProvider';
import { decideReimport, fillAssets, IMPORT_NOTE, MERGED_MARK, mergeSettings, planImport, refsIn, type ImportPlan, type ReimportDecision } from '@/lib/site-import';
import { PHOTO_CONSENT, type SiteSettings } from '@/lib/site-shared';
import { withLink } from '@/components/ui';

/**
 * 31차: 기존 홈페이지 가져오기 (룽아룬숙사 이전 3단계, ADR 0008)
 * 1) 묶음 zip을 브라우저에서 푼다(영상처럼 큰 파일은 풀지 않음) → 2) 무엇이 만들어질지 먼저 보여 준다
 * → 3) 그림을 한 장씩 올리고(서버 요청 한도 안) → 4) 쪽·소식·동화를 시안으로 만든다(있으면 새 판으로 더함).
 * 공개와 사이트 열기는 하지 않는다. 학교 관리자가 시안을 확인한 뒤 '가져온 시안 모두 공개' 또는 하나씩 공개한다.
 */
const SKIP_BYTES = 20 * 1024 * 1024; // 영상 등 큰 파일은 풀지 않는다
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
type Existing = { id: string; kind: string; key: string };
type Done = { kind: string; key: string; id: string; created: boolean };
/** 50차: 이미 있는 항목마다 다시 가져오기 판단(사람이 고쳤는지 보고 스스로 정함) */
type Decided = { key: string; kind: string; id: string; version: number; latestIsLive: boolean; imported: boolean; d: ReimportDecision };

async function send(url: string, method: string, fallback: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}
function readZip(buf: Uint8Array): Promise<Unzipped> {
  return new Promise((ok, fail) => unzip(buf, { filter: (f) => f.originalSize <= SKIP_BYTES && !f.name.endsWith('/') }, (e, out) => (e ? fail(e) : ok(out))));
}

export function ImportPanel({ settings, existing }: { settings: SiteSettings; existing: Existing[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const failed = t('common.saveFailed');
  const [files, setFiles] = useState<Unzipped | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<{ label: string; n: number; of: number } | null>(null);
  const [done, setDone] = useState<Done[] | null>(null);
  const [published, setPublished] = useState(false);
  const [keptStories, setKeptStories] = useState<string[]>([]);
  const [decided, setDecided] = useState<Decided[] | null>(null);

  // 묶음을 풀어 계획만 세운다. 읽지 못하면 FileDrop이 오류 문장을 칸 아래에 보여 준다
  async function pick([f]: File[]) {
    setErr(null); setPlan(null); setDone(null); setPublished(false); setDecided(null);
    try {
      const z = await readZip(new Uint8Array(await f.arrayBuffer()));
      const json = (p: string) => (z[p] ? JSON.parse(strFromU8(z[p])) : null);
      const content = json('content.json');
      if (!content) throw new Error(t('site.import.noContent'));
      const bookPath = Object.keys(z).find((p) => /^stories\/[^/]+\/book\.json$/.test(p));
      const manifest = json('manifest.json') as { files?: { path: string }[] } | null;
      const list = [...new Set([...Object.keys(z), ...(manifest?.files ?? []).map((x) => x.path)])];
      const nextPlan = planImport(content, list.filter((p) => z[p]), bookPath ? json(bookPath) : null, json('friends/pages.json'));
      // 50차: 이미 있는 항목은 최신 판을 읽어 '바꿈 / 빈 칸만 채움 / 그대로'를 미리 정한다
      const ds: Decided[] = [];
      for (const e of nextPlan.entries) {
        const has = existing.find((x) => x.kind === e.kind && x.key === e.key);
        if (!has) continue;
        const cur = await send(`/api/site/entries/${has.id}`, 'GET', failed) as { version: number; note: string | null; content: ImportPlan['entries'][number]['content']; latest_is_live: boolean };
        ds.push({ key: e.key, kind: e.kind, id: has.id, version: cur.version, latestIsLive: cur.latest_is_live, imported: (cur.note ?? '').startsWith(IMPORT_NOTE), d: decideReimport(e.kind, { note: cur.note, content: cur.content }, e.content) });
      }
      setDecided(ds);
      setPlan(nextPlan);
      setFiles(z);
      return t('site.import.read');
    } catch (e) {
      throw new Error(e instanceof SyntaxError ? t('site.import.badJson') : ((e as Error).message || t('site.import.readFailed')));
    }
  }

  async function run() {
    if (!plan || !files) return;
    setErr(null);
    const results: Done[] = [];
    const kept: string[] = [];
    try {
      const ids: Record<string, string> = {};
      const decision = (kind: string, key: string) => decided?.find((x) => x.kind === kind && x.key === key);
      // 실제로 쓸 내용만 모아, 거기 쓰인 그림만 올린다
      const writes = plan.entries.flatMap((e) => {
        const dd = decision(e.kind, e.key);
        if (!dd) return [{ e, content: e.content, id: null as string | null, base: null as number | null }];
        if (dd.d.action === 'replace' || dd.d.action === 'merge') return [{ e, content: dd.d.content, id: dd.id, base: dd.version }];
        if (dd.d.action === 'keep' && e.kind === 'story') kept.push(e.key);
        return [];
      });
      const needed = [...new Set(writes.flatMap((w) => refsIn(w.content)))];
      for (const [i, p] of needed.entries()) {
        setStep({ label: t('site.import.step.images'), n: i + 1, of: needed.length });
        const ext = p.split('.').pop()?.toLowerCase() ?? '';
        const form = new FormData();
        form.append('file', new File([files[p] as BlobPart], p.split('/').pop() ?? 'image', { type: MIME[ext] ?? 'application/octet-stream' }));
        const res = await fetch('/api/site/assets', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${p.split('/').pop()}: ${data.error ?? t('site.import.uploadFailed')}`);
        ids[p] = data.id;
      }
      const note = `${IMPORT_NOTE}${plan.exportedAt ? ` (${plan.exportedAt.slice(0, 10)} 묶음)` : ''}`;
      for (const [i, w] of writes.entries()) {
        const e = w.e;
        setStep({ label: t('site.import.step.drafts'), n: i + 1, of: writes.length });
        const content = fillAssets(w.content, ids);
        // 42차: 이미 있는 동화는 건드리지 않는다(decideReimport 'keep'). 50차: 고친 판은 빈 칸만, 안 고친 가져온 판은 바꿈 — 둘 다 base_version 으로 덮어쓰기 방지
        if (w.id) {
          const dd = decision(e.kind, e.key)!;
          await send(`/api/site/entries/${w.id}/versions`, 'POST', failed, { content, note: dd.d.action === 'merge' ? `${note} — ${MERGED_MARK}` : note, base_version: w.base });
          results.push({ kind: e.kind, key: e.key, id: w.id, created: false });
        } else {
          const r = await send('/api/site/entries', 'POST', failed, { kind: e.kind, key: e.key, visibility: e.visibility, sort: e.sort, virtue: e.virtue, character: e.character, text_in_image: e.text_in_image, content, note });
          results.push({ kind: e.kind, key: e.key, id: r.id, created: true });
        }
      }
      // 50차: 처음 가져오기(가져온 판이 하나도 없음)는 묶음 설정 그대로, 다시 가져오기는 빈 칸만(mergeSettings)
      const firstImport = !(decided ?? []).some((x) => x.imported);
      const merged = firstImport ? plan.settings : mergeSettings(settings, plan.settings);
      if (merged) {
        setStep({ label: t('site.import.step.settings'), n: 1, of: 1 });
        await send('/api/site/settings', 'POST', failed, { ...merged, public_slug: settings.public_slug, is_open: settings.is_open });
      }
      setKeptStories(kept); setDone(results); router.refresh();
    } catch (e) { setErr((e as Error).message); setDone(results.length ? results : null); }
    finally { setStep(null); }
  }

  async function publishAll() {
    if (!done) return;
    setErr(null);
    try {
      for (const [i, d] of done.entries()) { setStep({ label: t('site.import.step.publish'), n: i + 1, of: done.length }); await send(`/api/site/entries/${d.id}/publish`, 'POST', failed, {}); }
      setPublished(true); router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setStep(null); }
  }

  const count = (k: string, v?: string) => plan?.entries.filter((e) => e.kind === k && (v === undefined || e.visibility === v)).length ?? 0;
  return (
    <section className="card site-form" data-testid="site-import">
      <h2><FileArchive size={20} aria-hidden="true" /> {t('site.import.title')}</h2>
      <p className="fine">{withLink(t('site.import.lead'), { b: <b>{t('site.import.draft')}</b> })}</p>
      <FileDrop
        label={t('site.import.file')} accept={['.zip', 'application/zip', 'application/x-zip-compressed']} typeLabel="ZIP"
        hint={<>{t('site.import.fileHint')} {PHOTO_CONSENT}</>} disabled={!!step}
        onFiles={pick} inputTestId="import-file" testId="import-drop"
      />
      {plan && !done && (
        <div className="banner" data-tone="info" role="status" data-testid="import-plan">
          <p><b>{t('site.import.plan.title')}</b> {t('site.import.plan.counts', { pages: count('page', 'public'), hidden: count('page', 'unlisted'), news: count('news'), stories: count('story'), images: plan.files.length })}</p>
          <p>{t('site.import.plan.look', { langs: plan.settings.langs.join('·'), main: plan.settings.default_lang })}</p>
          {plan.notes.length > 0 && <ul>{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {decided && decided.length > 0 && (
            <div data-testid="import-decisions">
              <p><b>{t('site.import.existing', { n: decided.length })}</b> {t('site.import.existingNote')}</p>
              <ul className="import-decisions">
                {decided.map((x) => (
                  <li key={`${x.kind}:${x.key}`} data-action={x.d.action}>
                    <b>{x.key}</b> — {x.d.action === 'replace' ? t('site.import.action.replace') : x.d.action === 'merge' ? t('site.import.action.merge', { n: x.d.filled.length }) : x.d.action === 'keep' ? t('site.import.action.keep') : t('site.import.action.none')}
                    <span className="fine"> · {x.d.reason}{(x.d.action === 'merge' || x.d.action === 'replace') && !x.latestIsLive ? ` · ${t('site.import.unpublishedToo')}` : ''}</span>
                    {x.d.action === 'merge' && <details><summary>{t('site.import.showFilled')}</summary><ul>{x.d.filled.map((f) => <li key={f}>{f}</li>)}</ul></details>}
                    {(x.d.action === 'merge' || x.d.action === 'none') && x.d.skipped.length > 0 && <p className="fine">{t('site.import.skipped', { n: x.d.skipped.length, list: x.d.skipped.join(', ') })}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {step && (
        <div className="file-drop-progress" role="status" aria-live="polite" data-testid="import-progress">
          <span className="fine">{step.label} {step.of > 1 ? `${step.n} / ${step.of}` : '…'}</span>
          <div className="progress" aria-hidden="true"><div className="progress-fill" style={{ width: `${(step.n / step.of) * 100}%` }} /></div>
        </div>
      )}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {plan && !done && <div className="form-actions"><button type="button" className="btn btn-primary" onClick={run} disabled={!!step} data-testid="import-run"><Upload size={16} aria-hidden="true" />{t('site.import.run')}</button></div>}
      {done && (
        <div className="banner" data-tone="success" role="status" data-testid="import-done">
          <p>{t('site.import.done', { n: done.length, created: done.filter((d) => d.created).length, versions: done.filter((d) => !d.created).length })}</p>
          {keptStories.length > 0 && <p data-testid="import-kept">{t('site.import.kept', { list: keptStories.join(', ') })}</p>}
          {!published
            ? <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={publishAll} disabled={!!step} data-testid="import-publish">{t('site.import.publishAll')}</button></div>
            : <p data-testid="import-published">{t('site.import.published')}</p>}
        </div>
      )}
    </section>
  );
}
