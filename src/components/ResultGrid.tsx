'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 73차: 평가 결과 입력 표(학생 × 평가 항목). 바뀐 칸만 모아 한 번에 보낸다(서버가 한 트랜잭션에서 사건으로 추가).
 * 마감한 수업은 학교 관리자가 사유와 함께 정정한다(DB가 판정).
 */
export function ResultGrid({ offeringId, students, assessments, values, closed }: {
  offeringId: string;
  students: { id: string; name: string }[];
  assessments: { id: string; code: string; title: string; max: number | null }[];
  values: Record<string, string>; // `${assessmentId}:${personId}` → 점수
  closed: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(values);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const changed = Object.entries(v).filter(([k, x]) => x !== (values[k] ?? '') && x.trim() !== '');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed.length) return setMsg({ text: '바뀐 칸이 없습니다.' });
    setBusy(true); setMsg(null);
    const entries = changed.map(([k, score]) => { const [assessmentId, personId] = k.split(':'); return { assessmentId, personId, score: Number(score) }; });
    const res = await fetch('/api/grades', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'results', offeringId, entries, reason }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: data.error ?? '저장하지 못했습니다.', error: true });
    setMsg({ text: `${data.saved}칸을 저장했습니다.` });
    router.refresh();
  }
  if (!students.length) return <p className="muted">수강생이 없습니다.</p>;
  if (!assessments.length) return <p className="muted">점수를 넣을 평가 항목(과목 총괄 축)이 없습니다.</p>;
  return (
    <form onSubmit={save} className="stack" data-testid="result-grid">
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th scope="col">학생</th>{assessments.map((a) => <th key={a.id} scope="col">{a.title}<br /><small className="muted">{a.code}{a.max != null ? ` · 만점 ${a.max}` : ''}</small></th>)}</tr></thead>
        <tbody>{students.map((s) => (
          <tr key={s.id}><th scope="row">{s.name}</th>{assessments.map((a) => {
            const k = `${a.id}:${s.id}`;
            return <td key={k}><input type="number" step="any" min={0} max={a.max ?? undefined} inputMode="decimal" aria-label={`${s.name} ${a.title}`}
              value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={v[k] !== (values[k] ?? '') ? 'cell-changed' : undefined} style={{ width: '6rem' }} /></td>;
          })}</tr>))}</tbody>
      </table></div>
      {closed && <label>정정 사유(마감한 수업: 학교 관리자만)<input value={reason} onChange={(e) => setReason(e.target.value)} required /></label>}
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>바뀐 칸 저장{changed.length ? ` (${changed.length})` : ''}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
