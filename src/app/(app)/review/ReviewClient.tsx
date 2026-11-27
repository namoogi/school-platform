'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Question } from '@/lib/services';
import type { PeriodValue } from '@/lib/analyze';
import { useI18n } from '@/components/I18nProvider';

export function ReviewClient({ question, currentVersion, canConfirm = true }: { question: Question; currentVersion: number | null; canConfirm?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
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
        <h2>{t('review.q.relation')}</h2>
        <span className="tag">{question.analyzer.startsWith('rule-based') ? t('review.analyzerRule') : question.analyzer}</span>
      </div>
      {question.differs_from_rule_id && (
        <p className="alert" role="alert">{t('review.conflictAlert', { v: currentVersion })}</p>
      )}
      <p className="question-text" data-testid="prompt">{question.prompt}</p>

      <h3 className="section-title">{t('review.proposal')}</h3>
      <table className="grid-table">
        <thead><tr><th>{t('review.col.id')}</th><th>{t('review.col.label')}</th><th>{t('review.col.assessments')}</th></tr></thead>
        <tbody>
          {question.proposal.periods.map((p) => (
            <tr key={p.id}><td><code>{p.id}</code></td><td>{p.label}</td><td>{p.assessments.join(', ') || '—'}</td></tr>
          ))}
        </tbody>
      </table>

      <details open className="evidence" data-testid="evidence">
        <summary>{t('review.evidence', { n: question.evidence.length })}</summary>
        <ul>
          {question.evidence.map((e, i) => (
            <li key={i}><span className="file">{e.file_name}</span> <span className="tag">{e.location ?? t('review.rowN', { n: e.row_number })}</span> {e.claim}</li>
          ))}
        </ul>
      </details>
      {question.issues.length > 0 && (
        <div className="issues" data-testid="issues">
          <strong>{t('review.issuesTitle')}</strong>
          <ul>{question.issues.map((x, i) => (
            <li key={i}>{x.message}{x.evidence && <> <span className="muted">({x.evidence.file_name} {x.evidence.location ?? t('review.rowN', { n: x.evidence.row_number })})</span></>}</li>
          ))}</ul>
        </div>
      )}

      {!canConfirm && <p className="notice">{t('review.teacherNote')}</p>}
      {canConfirm && <>
      <fieldset className="choices">
        <legend>{t('review.decision')}</legend>
        <label className="radio"><input type="radio" name="decision" checked={decision === 'accepted'} onChange={() => setDecision('accepted')} /> {t('review.accept')}</label>
        <label className="radio"><input type="radio" name="decision" checked={decision === 'edited'} onChange={() => setDecision('edited')} /> {t('review.edit')}</label>
      </fieldset>

      {decision === 'edited' && (
        <div className="editor" data-testid="editor">
          <h3 className="section-title">{t('review.labelsTitle')}</h3>
          {draft.periods.map((p, i) => (
            <label key={p.id}>{p.id}
              <input value={p.label} onChange={(e) => setDraft({ periods: draft.periods.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            </label>
          ))}
          {assessments.length > 0 && <>
            <h3 className="section-title">{t('review.assignTitle')}</h3>
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
      <label>{t('review.memo')}{t(decision === 'edited' ? 'review.required' : 'review.optional')}
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3}
          placeholder={t('review.memoPlaceholder')} />
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="button" className="primary" onClick={submit} disabled={busy}>
        {currentVersion ? t('review.confirmAs', { v: currentVersion + 1 }) : t('review.confirmFirst')}
      </button>
      </>}
    </>
  );
}
