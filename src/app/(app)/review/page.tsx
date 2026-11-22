import { loadForPage } from '@/lib/page';
import { listRules, openQuestion } from '@/lib/services';
import { ReviewClient } from './ReviewClient';
import { PeriodTable } from '@/components/PeriodTable';

export default async function ReviewPage() {
  const { question, rules } = await loadForPage(async ({ db, school }) => ({
    question: await openQuestion(db, school.id),
    rules: await listRules(db, school.id),
  }));
  const current = rules[0];
  return (
    <>
      <div className="page-head">
        <div><h1>관리자 확인</h1><p>자료에서 추정한 내용과 근거 행을 보고 확인하거나 고칩니다. 확정한 값은 새 버전으로 저장됩니다.</p></div>
      </div>
      <div className="review-grid">
        <section className="card" data-testid="question">
          {question
            ? <ReviewClient question={JSON.parse(JSON.stringify(question))} currentVersion={current?.version ?? null} />
            : <>
                <h2>확인할 질문이 없습니다</h2>
                <p className="muted">{current ? '확정한 규칙이 현재 자료와 일치합니다. 자료를 더 올리면 다시 분석합니다.' : '학사력이나 평가 자료를 먼저 첨부해 주세요.'}</p>
                <a className="button secondary" href="/intake">자료 첨부로</a>
              </>}
        </section>
        <section className="card">
          <div className="between"><h2>확정한 학기 규칙</h2>{current && <span className="tag green">{current.version}판 사용 중</span>}</div>
          {!current && <p className="muted empty">아직 확정한 규칙이 없습니다.</p>}
          {rules.map((r) => (
            <details key={r.id} open={r === current} className="rule" data-testid={`rule-v${r.version}`}>
              <summary>
                <strong>{r.version}판</strong> · {r.decision === 'accepted' ? '분석 결과 확인' : '관리자 수정'} ·{' '}
                <time>{new Date(r.confirmed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
              </summary>
              <PeriodTable value={r.value} />
              {r.rationale && <p className="rationale"><strong>수정 근거</strong> {r.rationale}</p>}
              <p className="fine">근거 행 {r.evidence.length}개 · 이후 자료 추가로 바뀌지 않습니다.</p>
            </details>
          ))}
          {current && <a className="button primary" href="/documents">이 규칙으로 문서 발행</a>}
        </section>
      </div>
    </>
  );
}
