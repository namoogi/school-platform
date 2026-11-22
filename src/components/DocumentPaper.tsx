import type { Snapshot } from '@/lib/services';

/**
 * 발행본 렌더러. 오직 스냅샷 값만 읽는다.
 * 그래서 원본 자료·규칙·양식이 나중에 바뀌어도 발행 당시 표기가 그대로 재현된다.
 */
export function DocumentPaper({ snapshot, status }: { snapshot: Snapshot; status: string }) {
  const t = snapshot.template;
  const ko = snapshot.school.locale === 'ko';
  const yearLabel = ko ? `${snapshot.academic_year}학년도` : `Academic Year ${snapshot.academic_year}`;
  const periods = snapshot.rule.value.periods;
  return (
    <article className="paper" lang={ko ? 'ko' : 'en'} data-testid="paper">
      <div className="paper-mark"><span>{snapshot.school.name.slice(0, 1)}</span>{snapshot.school.name}</div>
      <h2 className="paper-title">{t.title}</h2>
      <p className="paper-meta">{yearLabel} / {periods.map((p) => p.label).join(' · ')} / {snapshot.student.label}</p>
      <hr />
      <table className="paper-table">
        <thead><tr><th>{t.period_heading}</th><th>{t.assessment_heading}</th><th>{ko ? '기록' : 'Record'}</th></tr></thead>
        <tbody>
          {periods.map((p) =>
            (p.assessments.length ? p.assessments : ['—']).map((a, i) => (
              <tr key={p.id + a}>
                {i === 0 && <th scope="row" rowSpan={Math.max(p.assessments.length, 1)}>{p.label}</th>}
                <td>{a}</td>
                <td className="muted">{a === '—' ? '' : ko ? '합성 관찰 기록' : 'Synthetic observation'}</td>
              </tr>
            )))}
        </tbody>
      </table>
      <footer className="paper-foot">
        <span>{t.footer_note}</span>
        <span>{status}</span>
      </footer>
    </article>
  );
}
