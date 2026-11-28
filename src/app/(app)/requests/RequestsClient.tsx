'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';

// failed: 서버가 오류 문구를 주지 않을 때 보일 글(화면 언어로 넘긴다)
async function call(url: string, method: 'GET' | 'POST', failed: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? failed);
  return data;
}
// 다음 상태(이름은 사전의 req.action.*)
const NEXT: Record<string, string[]> = {
  received: ['in_review', 'granted', 'amended', 'denied', 'not_applicable'],
  in_review: ['granted', 'amended', 'denied', 'not_applicable'],
  denied: ['hearing_offered', 'amended', 'closed'],
  hearing_offered: ['amended', 'closed'],
};

/** 63차(ADR 0030): 요청 결정 — 거부·대상 아님은 이유, 수정함은 정정 판 id */
export function DecideForm({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const options = NEXT[status] ?? [];
  const [next, setNext] = useState(options[0] ?? '');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!options.length) return null;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    try { await call('/api/requests/decide', 'POST', t('common.failed'), { requestId: id, status: next, note, fromStatus: status, correctionRef: ref || undefined }); setMsg(null); router.refresh(); }
    catch (x) { setMsg((x as Error).message); }
  }
  return (
    <form className="row-wrap" onSubmit={go}>
      <select value={next} onChange={(e) => setNext(e.target.value)} aria-label={t('req.decision')}>{options.map((v) => <option key={v} value={v}>{t(`req.action.${v}` as MsgKey)}</option>)}</select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('req.notePlaceholder')} aria-label={t('req.reason')} maxLength={2000} />
      {next === 'amended' && <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t('req.correctionId')} aria-label={t('req.correctionId')} />}
      <button type="submit" className="btn btn-sm">{t('req.decision')}</button>
      {msg && <span className="alert" role="alert">{msg}</span>}
    </form>
  );
}

/** 63차(ADR 0028): 보존 규칙 새 판 */
export function RetentionForm({ current }: { current: { version: number; years_after_exit: number | null } | null }) {
  const router = useRouter();
  const { t } = useI18n();
  const [years, setYears] = useState(current?.years_after_exit == null ? '' : String(current.years_after_exit));
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await call('/api/requests/retention', 'POST', t('common.failed'), { yearsAfterExit: years === '' ? null : Number(years), why, base_version: current?.version ?? 0 }); setMsg({ text: t('req.retentionSaved', { v: r.version }) }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={save} data-testid="retention-form">
      <label>{t('req.retentionYears')}<input type="number" min={0} max={100} value={years} onChange={(e) => setYears(e.target.value)} /></label>
      <label>{t('req.why')}<input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} placeholder={t('req.whyPlaceholder')} /></label>
      <div className="form-actions"><button type="submit" className="btn">{t('req.saveVersion')}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}

type Preview = { ok: boolean; why: string | null; exit_on: string | null; counts: Record<string, number>; kept: string[] };
// 가림 대상 이름은 사전의 req.count.*
const COUNTS = ['narratives', 'evidence_items', 'attendance_notes', 'assessment_comments', 'custom_records', 'record_closures', 'record_documents', 'requests'];

/** 파기: 미리보기(대상·건수·남는 것) → 사유 → 실행. 되돌릴 수 없다 */
export function RedactPanel({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [person, setPerson] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function preview(id: string) {
    setPerson(id); setPv(null); setMsg(null);
    if (!id) return;
    try { setPv(await call(`/api/requests/redact?person=${id}`, 'GET', t('common.failed'))); } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  async function redact() {
    if (!pv || !window.confirm(t('req.redactConfirm'))) return;
    try { await call('/api/requests/redact', 'POST', t('common.failed'), { personId: person, reason, expectedCounts: pv.counts }); setMsg({ text: t('req.redacted') }); setPv(null); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="redact-panel">
      <label>{t('req.person')}<select value={person} onChange={(e) => preview(e.target.value)} aria-label={t('req.personAria')}>
        <option value="">{t('req.choose')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {pv && (
        <>
          <p>{pv.ok ? t('req.canRedact', { exit: pv.exit_on ? t('req.exitOn', { date: pv.exit_on }) : '' }) : t('req.cannotRedact', { why: pv.why ?? '' })}</p>
          <p className="fine">{t('req.targets', { list: Object.entries(pv.counts).filter(([, n]) => n > 0).map(([k, n]) => `${COUNTS.includes(k) ? t(`req.count.${k}` as MsgKey) : k} ${n}`).join(' · ') || t('docs.none') })}</p>
          <p className="fine">{t('req.kept', { list: pv.kept.join(', ') })}</p>
          {pv.ok && (
            <>
              <label>{t('req.redactReason')}<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t('req.redactPlaceholder')} /></label>
              <div className="form-actions"><button type="button" className="btn btn-danger" disabled={!reason.trim()} onClick={redact}>{t('req.redactButton')}</button></div>
            </>
          )}
        </>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}
