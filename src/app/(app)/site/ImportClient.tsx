'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { unzip, strFromU8, type Unzipped } from 'fflate';
import { FileArchive, Upload } from 'lucide-react';
import { FileDrop } from '@/components/FileDrop';
import { fillAssets, planImport, type ImportPlan } from '@/lib/site-import';
import type { SiteSettings } from '@/lib/site-shared';

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

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '저장하지 못했습니다.');
  return data;
}
function readZip(buf: Uint8Array): Promise<Unzipped> {
  return new Promise((ok, fail) => unzip(buf, { filter: (f) => f.originalSize <= SKIP_BYTES && !f.name.endsWith('/') }, (e, out) => (e ? fail(e) : ok(out))));
}

export function ImportPanel({ settings, existing }: { settings: SiteSettings; existing: Existing[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<Unzipped | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<{ label: string; n: number; of: number } | null>(null);
  const [done, setDone] = useState<Done[] | null>(null);
  const [published, setPublished] = useState(false);

  // 묶음을 풀어 계획만 세운다. 읽지 못하면 FileDrop이 오류 문장을 칸 아래에 보여 준다
  async function pick([f]: File[]) {
    setErr(null); setPlan(null); setDone(null); setPublished(false);
    try {
      const z = await readZip(new Uint8Array(await f.arrayBuffer()));
      const json = (p: string) => (z[p] ? JSON.parse(strFromU8(z[p])) : null);
      const content = json('content.json');
      if (!content) throw new Error('묶음 안에 content.json 이 없습니다. 옛 사이트에서 만든 내보내기 묶음(zip)을 골라 주세요.');
      const bookPath = Object.keys(z).find((p) => /^stories\/[^/]+\/book\.json$/.test(p));
      const manifest = json('manifest.json') as { files?: { path: string }[] } | null;
      const list = [...new Set([...Object.keys(z), ...(manifest?.files ?? []).map((x) => x.path)])];
      setPlan(planImport(content, list.filter((p) => z[p]), bookPath ? json(bookPath) : null, json('friends/pages.json')));
      setFiles(z);
      return '묶음을 읽었습니다. 아래에서 만들 것을 확인하세요.';
    } catch (e) {
      throw new Error(e instanceof SyntaxError ? '묶음 안의 JSON을 읽지 못했습니다. 옛 사이트에서 다시 내보내 주세요.' : ((e as Error).message || '묶음을 읽지 못했습니다.'));
    }
  }

  async function run() {
    if (!plan || !files) return;
    setErr(null);
    const results: Done[] = [];
    try {
      const ids: Record<string, string> = {};
      for (const [i, p] of plan.files.entries()) {
        setStep({ label: '그림 올리는 중', n: i + 1, of: plan.files.length });
        const ext = p.split('.').pop()?.toLowerCase() ?? '';
        const form = new FormData();
        form.append('file', new File([files[p] as BlobPart], p.split('/').pop() ?? 'image', { type: MIME[ext] ?? 'application/octet-stream' }));
        const res = await fetch('/api/site/assets', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${p.split('/').pop()}: ${data.error ?? '올리지 못했습니다.'}`);
        ids[p] = data.id;
      }
      const note = `기존 홈페이지 가져오기${plan.exportedAt ? ` (${plan.exportedAt.slice(0, 10)} 묶음)` : ''}`;
      for (const [i, e] of plan.entries.entries()) {
        setStep({ label: '시안 만드는 중', n: i + 1, of: plan.entries.length });
        const content = fillAssets(e.content, ids);
        const has = existing.find((x) => x.kind === e.kind && x.key === e.key);
        if (has) {
          await send(`/api/site/entries/${has.id}/versions`, 'POST', { content, note });
          results.push({ kind: e.kind, key: e.key, id: has.id, created: false });
        } else {
          const r = await send('/api/site/entries', 'POST', { kind: e.kind, key: e.key, visibility: e.visibility, sort: e.sort, virtue: e.virtue, character: e.character, text_in_image: e.text_in_image, content, note });
          results.push({ kind: e.kind, key: e.key, id: r.id, created: true });
        }
      }
      setStep({ label: '설정 맞추는 중', n: 1, of: 1 });
      await send('/api/site/settings', 'POST', { ...plan.settings, public_slug: settings.public_slug, is_open: settings.is_open });
      setDone(results); router.refresh();
    } catch (e) { setErr((e as Error).message); setDone(results.length ? results : null); }
    finally { setStep(null); }
  }

  async function publishAll() {
    if (!done) return;
    setErr(null);
    try {
      for (const [i, d] of done.entries()) { setStep({ label: '공개하는 중', n: i + 1, of: done.length }); await send(`/api/site/entries/${d.id}/publish`, 'POST', {}); }
      setPublished(true); router.refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setStep(null); }
  }

  const count = (k: string, v?: string) => plan?.entries.filter((e) => e.kind === k && (v === undefined || e.visibility === v)).length ?? 0;
  return (
    <section className="card site-form" data-testid="site-import">
      <h2><FileArchive size={20} aria-hidden="true" /> 기존 홈페이지 가져오기</h2>
      <p className="fine">옛 사이트에서 만든 내보내기 묶음(zip)을 고르면 쪽·소식·동화·후원자 쪽을 <b>시안</b>으로 만듭니다. 이미 있는 항목은 덮어쓰지 않고 새 판으로 더합니다. 공개와 홈페이지 열기는 시안을 확인한 뒤 따로 합니다.</p>
      <FileDrop
        label="묶음 파일" accept={['.zip', 'application/zip', 'application/x-zip-compressed']} typeLabel="ZIP"
        hint="브라우저 안에서 풀고, 올리기 전에 만들 것을 먼저 보여 줍니다." disabled={!!step}
        onFiles={pick} inputTestId="import-file" testId="import-drop"
      />
      {plan && !done && (
        <div className="banner" data-tone="info" role="status" data-testid="import-plan">
          <p><b>만들 것:</b> 쪽 {count('page', 'public')}개 · 숨은 쪽(후원자) {count('page', 'unlisted')}개 · 소식 {count('news')}개 · 동화 {count('story')}편 · 그림 {plan.files.length}장</p>
          <p>화면 모양을 새벽빛 매거진으로, 언어를 {plan.settings.langs.join('·')}(기본 {plan.settings.default_lang})로 맞춥니다.</p>
          {plan.notes.length > 0 && <ul>{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      )}
      {step && (
        <div className="file-drop-progress" role="status" aria-live="polite" data-testid="import-progress">
          <span className="fine">{step.label} {step.of > 1 ? `${step.n} / ${step.of}` : '…'}</span>
          <div className="progress" aria-hidden="true"><div className="progress-fill" style={{ width: `${(step.n / step.of) * 100}%` }} /></div>
        </div>
      )}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {plan && !done && <div className="form-actions"><button type="button" className="btn btn-primary" onClick={run} disabled={!!step} data-testid="import-run"><Upload size={16} aria-hidden="true" />시안으로 가져오기</button></div>}
      {done && (
        <div className="banner" data-tone="success" role="status" data-testid="import-done">
          <p>시안 {done.length}개를 만들었습니다(새로 {done.filter((d) => d.created).length} · 새 판 {done.filter((d) => !d.created).length}). 왼쪽 쪽·소식·동화 목록에서 하나씩 열어 시안 미리보기로 확인하세요.</p>
          {!published
            ? <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={publishAll} disabled={!!step} data-testid="import-publish">확인했습니다 — 가져온 시안 모두 공개</button></div>
            : <p data-testid="import-published">모두 공개했습니다. 방문자에게 보이려면 위 설정에서 ‘홈페이지 열기’를 켜고 저장하세요.</p>}
        </div>
      )}
    </section>
  );
}
