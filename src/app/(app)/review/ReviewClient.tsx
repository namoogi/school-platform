'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Question } from '@/lib/services';
import type { PeriodValue } from '@/lib/analyze';

export function ReviewClient({ question, currentVersion, canConfirm = true }: { question: Question; currentVersion: number | null; canConfirm?: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState<'accepted' | 'edited'>('accepted');
  const [draft, setDraft] = useState<PeriodValue>(() => structuredClone(question.proposal));
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 평가 기간 → 소속 기간 선택표 (수정 모드)
  const assessments = useMemo(
    () => question.proposal.periods.flatMap((p) => p.assessments.map((a) => ({ label: a, original: p.id }))),
    [question.proposal],
  );
  const parentOf = (label: string) => draft.periods.find((p) => p.assessments.includes(label))?.id ?? '';
  function moveAssessment(label: string, to: string) {
    setDraft({
      periods: draft.periods.map((p) => ({
        ...p,
        assessments: p.id === to
          ? [...p.assessments.filter((a) => a !== label), label]
          : p.assessments.filter((a) => a !== label),
      })),
    });
  }

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/questions/${question.id}/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, value: decision === 'edited' ? draft : undefined, rationale }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    router.refresh();
  }

  return (
    <>
      <div className="between">
        <h2>학기와 평가 기간의 관계</h2>
        <span className="tag">{question.analyzer.startsWith('rule-based') ? '규칙 기반 분석 · AI 미연결' : question.analyzer}</span>
      </div>
      {question.differs_from_rule_id && (
        <p className="alert" role="alert">새 자료가 확정한 {currentVersion}판과 다르거나 충돌합니다. 확정값은 그대로 유지되며, 아래에서 새 판으로 확정해야 바뀝니다.</p>
      )}
      <p className="question-text" data-testid="prompt">{question.prompt}</p>

      <h3 className="section-title">추정 결과</h3>
      <table className="grid-table">
        <thead><tr><th>기간 ID</th><th>기간 이름</th><th>소속 평가 기간</th></tr></thead>
        <tbody>
          {question.proposal.periods.map((p) => (
            <tr key={p.id}><td><code>{p.id}</code></td><td>{p.label}</td><td>{p.assessments.join(', ') || '—'}</td></tr>
          ))}
        </tbody>
      </table>

      <details open className="evidence" data-testid="evidence">
        <summary>추정 근거 · {question.evidence.length}행</summary>
        <ul>
          {question.evidence.map((e, i) => (
            <li key={i}><span className="file">{e.file_name}</span> <span className="tag">{e.location ?? `${e.row_number}행`}</span> {e.claim}</li>
          ))}
        </ul>
      </details>
      {question.issues.length > 0 && (
        <div className="issues" data-testid="issues">
          <strong>확인이 필요한 점</strong>
          <ul>{question.issues.map((x, i) => (
            <li key={i}>{x.message}{x.evidence && <> <span className="muted">({x.evidence.file_name} {x.evidence.location ?? `${x.evidence.row_number}행`})</span></>}</li>
          ))}</ul>
        </div>
      )}

      {!canConfirm && <p className="notice">규칙 확정은 학교 관리자가 합니다. 근거를 확인하고 의견은 관리자에게 전해 주세요.</p>}
      {canConfirm && <>
      <fieldset className="choices">
        <legend>처리</legend>
        <label className="radio"><input type="radio" name="decision" checked={decision === 'accepted'} onChange={() => setDecision('accepted')} /> 추정 결과가 맞습니다</label>
        <label className="radio"><input type="radio" name="decision" checked={decision === 'edited'} onChange={() => setDecision('edited')} /> 고쳐서 확정합니다</label>
      </fieldset>

      {decision === 'edited' && (
        <div className="editor" data-testid="editor">
          <h3 className="section-title">문서에 쓸 기간 이름</h3>
          {draft.periods.map((p, i) => (
            <label key={p.id}>{p.id}
              <input value={p.label} onChange={(e) => setDraft({ periods: draft.periods.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            </label>
          ))}
          {assessments.length > 0 && <>
            <h3 className="section-title">평가 기간의 소속</h3>
            {assessments.map((a) => (
              <label key={a.label}>{a.label}
                <select value={parentOf(a.label)} onChange={(e) => moveAssessment(a.label, e.target.value)}>
                  {draft.periods.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.id})</option>)}
                </select>
              </label>
            ))}
          </>}
        </div>
      )}
      <label>근거 메모{decision === 'edited' ? ' (필수)' : ' (선택)'}
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3}
          placeholder="예: 2026학년도 학칙 개정으로 학기 이름을 ‘봄학기·가을학기’로 표기" />
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="button" className="primary" onClick={submit} disabled={busy}>
        {currentVersion ? `${currentVersion + 1}판으로 확정` : '이 기준 확정'}
      </button>
      </>}
    </>
  );
}
