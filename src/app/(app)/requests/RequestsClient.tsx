'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function call(url: string, method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}
const NEXT: Record<string, [string, string][]> = {
  received: [['in_review', '검토 시작'], ['granted', '열람 허락'], ['amended', '수정함'], ['denied', '거부'], ['not_applicable', '대상 아님']],
  in_review: [['granted', '열람 허락'], ['amended', '수정함'], ['denied', '거부'], ['not_applicable', '대상 아님']],
  denied: [['hearing_offered', '청문 제안'], ['amended', '수정함'], ['closed', '끝냄']],
  hearing_offered: [['amended', '수정함'], ['closed', '끝냄']],
};

/** 63차(ADR 0030): 요청 결정 — 거부·대상 아님은 이유, 수정함은 정정 판 id */
export function DecideForm({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const options = NEXT[status] ?? [];
  const [next, setNext] = useState(options[0]?.[0] ?? '');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!options.length) return null;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    try { await call('/api/requests/decide', 'POST', { requestId: id, status: next, note, fromStatus: status, correctionRef: ref || undefined }); setMsg(null); router.refresh(); }
    catch (x) { setMsg((x as Error).message); }
  }
  return (
    <form className="row-wrap" onSubmit={go}>
      <select value={next} onChange={(e) => setNext(e.target.value)} aria-label="결정">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="이유·답변(거부·대상 아님은 필수)" aria-label="이유" maxLength={2000} />
      {next === 'amended' && <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="정정 판 id" aria-label="정정 판 id" />}
      <button type="submit" className="btn btn-sm">결정</button>
      {msg && <span className="alert" role="alert">{msg}</span>}
    </form>
  );
}

/** 63차(ADR 0028): 보존 규칙 새 판 */
export function RetentionForm({ current }: { current: { version: number; years_after_exit: number | null } | null }) {
  const router = useRouter();
  const [years, setYears] = useState(current?.years_after_exit == null ? '' : String(current.years_after_exit));
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await call('/api/requests/retention', 'POST', { yearsAfterExit: years === '' ? null : Number(years), why, base_version: current?.version ?? 0 }); setMsg({ text: `${r.version}판으로 저장했습니다.` }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={save} data-testid="retention-form">
      <label>퇴학·졸업 뒤 보존 기간(년, 비우면 영구)<input type="number" min={0} max={100} value={years} onChange={(e) => setYears(e.target.value)} /></label>
      <label>이유(근거 규정)<input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} placeholder="예: 학교 규정 제○조, 주 보존 일정표" /></label>
      <div className="form-actions"><button type="submit" className="btn">새 판 저장</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}

type Preview = { ok: boolean; why: string | null; exit_on: string | null; counts: Record<string, number>; kept: string[] };
const COUNT: Record<string, string> = { narratives: '서술', evidence_items: '증거물', attendance_notes: '출결 메모', assessment_comments: '평가 의견', custom_records: '학교 정의 기록',
  record_closures: '학년도 기록 판', record_documents: '발행본', requests: '요청' };

/** 파기: 미리보기(대상·건수·남는 것) → 사유 → 실행. 되돌릴 수 없다 */
export function RedactPanel({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [person, setPerson] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function preview(id: string) {
    setPerson(id); setPv(null); setMsg(null);
    if (!id) return;
    try { setPv(await call(`/api/requests/redact?person=${id}`, 'GET')); } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  async function redact() {
    if (!pv || !window.confirm('파기는 되돌릴 수 없습니다. 미리보기의 서술·메모를 가림 값으로 바꿉니다. 진행할까요?')) return;
    try { await call('/api/requests/redact', 'POST', { personId: person, reason, expectedCounts: pv.counts }); setMsg({ text: '파기했습니다. 파기 사건이 남았습니다.' }); setPv(null); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="redact-panel">
      <label>사람<select value={person} onChange={(e) => preview(e.target.value)} aria-label="파기할 사람">
        <option value="">고르세요</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {pv && (
        <>
          <p>{pv.ok ? <>파기할 수 있습니다{pv.exit_on ? ` (재적 끝 ${pv.exit_on})` : ''}.</> : <>파기할 수 없습니다: {pv.why}</>}</p>
          <p className="fine">가림 대상: {Object.entries(pv.counts).filter(([, n]) => n > 0).map(([k, n]) => `${COUNT[k] ?? k} ${n}`).join(' · ') || '없음'}</p>
          <p className="fine">남는 것: {pv.kept.join(', ')}</p>
          {pv.ok && (
            <>
              <label>파기 사유<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="예: 보존 기간(졸업 후 5년) 지남" /></label>
              <div className="form-actions"><button type="button" className="btn btn-danger" disabled={!reason.trim()} onClick={redact}>파기(되돌릴 수 없음)</button></div>
            </>
          )}
        </>
      )}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}
