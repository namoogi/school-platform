import Link from 'next/link';
import { Archive, CheckCheck, FileStack, Inbox, type LucideIcon } from 'lucide-react';
import { loadForPage } from '@/lib/page';
import { flowProgress, listQuestions, listRules, type Question, type Rule } from '@/lib/services';
import { EmptyState, LEARNING_STEPS, StatusBadge, Steps } from '@/components/ui';
import { PeriodTable } from '@/components/PeriodTable';
import { ReviewClient } from './ReviewClient';
import { TriageKeys } from './TriageKeys';

export const dynamic = 'force-dynamic';

type Box = 'open' | 'answered' | 'superseded' | 'rules';
type Q = Question & { answered_at: string | null };
const BOXES: { key: Box; label: string; icon: LucideIcon }[] = [
  { key: 'open', label: '확인 대기', icon: Inbox },
  { key: 'answered', label: '답변함', icon: CheckCheck },
  { key: 'superseded', label: '새 자료로 대체됨', icon: Archive },
  { key: 'rules', label: '확정한 판', icon: FileStack },
];
const KST = 'Asia/Seoul';
const when = (d: string) => new Date(d).toLocaleString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * 관리자 확인 (25차, ADR 0006 3단 작업함): 함 → 목록 → 상세.
 * 확인 대기 질문은 근거와 지금 확정된 판을 나란히 보고 바로 결정한다. 확정은 언제나 새 판으로 쌓인다.
 * 선택 상태는 주소(?box=&id=)에 담아 새로 고침·공유해도 같은 화면이 열린다.
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ box?: string; id?: string }> }) {
  const sp = await searchParams;
  const { questions, rules, school, done } = await loadForPage(async ({ db, school }) => ({
    questions: await listQuestions(db, school.id),
    rules: await listRules(db, school.id),
    done: await flowProgress(db, school.id),
  }), { module: 'intake' });

  const byBox: Record<Box, { id: string }[]> = {
    open: questions.filter((q) => q.status === 'open'),
    answered: questions.filter((q) => q.status === 'answered'),
    superseded: questions.filter((q) => q.status === 'superseded'),
    rules,
  };
  const box: Box = BOXES.some((b) => b.key === sp.box) ? (sp.box as Box) : byBox.open.length ? 'open' : 'rules';
  const list = byBox[box];
  const selectedId = list.some((x) => x.id === sp.id) ? sp.id! : list[0]?.id;
  const current = rules[0];
  const href = (b: Box, id?: string) => `/review?box=${b}${id ? `&id=${id}` : ''}`;
  const ids = list.map((x) => href(box, x.id));

  return (
    <div className="triage" data-testid="triage">
      <header className="triage-head">
        <div>
          <h1>관리자 확인</h1>
          <p className="fine">자료에서 추정한 내용과 근거를 보고 확정합니다. 확정은 새 판으로 쌓이고 이전 판과 발행본은 그대로 남습니다.</p>
        </div>
        <Steps current="review" done={done} items={LEARNING_STEPS} />
      </header>

      <nav className="triage-boxes" aria-label="확인 함">
        {BOXES.map((b) => (
          <Link key={b.key} href={href(b.key)} className="triage-box" aria-current={b.key === box ? 'page' : undefined}>
            <b.icon size={18} aria-hidden="true" /><span>{b.label}</span><span className="triage-count">{byBox[b.key].length}</span>
          </Link>
        ))}
        <p className="triage-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> 위·아래 이동</p>
      </nav>

      <section className="triage-list" aria-label={`${BOXES.find((b) => b.key === box)!.label} 목록`}>
        <ul>
          {box === 'rules'
            ? rules.map((r) => (
              <li key={r.id}>
                <Link href={href(box, r.id)} className="triage-item" aria-current={r.id === selectedId ? 'true' : undefined}>
                  <span className="triage-item-top">
                    <StatusBadge tone={r === current ? 'success' : 'neutral'}>{r === current ? '사용 중' : '이전 판'}</StatusBadge>
                    <span className="triage-time">{when(r.confirmed_at)}</span>
                  </span>
                  <span className="triage-item-title">{r.version}판 · {r.decision === 'accepted' ? '분석 결과 확인' : '관리자 수정'}</span>
                  <span className="triage-item-sub">{r.value.periods.map((p) => p.label).join(' · ')}</span>
                </Link>
              </li>))
            : (list as Q[]).map((q) => (
              <li key={q.id}>
                <Link href={href(box, q.id)} className="triage-item" aria-current={q.id === selectedId ? 'true' : undefined}>
                  <span className="triage-item-top">
                    <QuestionBadge q={q} />
                    <span className="triage-time">{when(q.created_at)}</span>
                  </span>
                  <span className="triage-item-title">{q.differs_from_rule_id ? '새 자료가 확정 규칙과 다릅니다' : '학기와 평가 기간의 관계'}</span>
                  <span className="triage-item-sub">근거 {q.evidence.length}행{q.issues.length ? ` · 확인할 점 ${q.issues.length}개` : ''}</span>
                </Link>
              </li>))}
        </ul>
        {list.length === 0 && (
          <p className="triage-empty">{box === 'open' ? '확인할 질문이 없습니다.' : box === 'rules' ? '아직 확정한 판이 없습니다.' : '이 함은 비어 있습니다.'}</p>
        )}
      </section>

      <section className="triage-detail" aria-label="상세">
        {box === 'rules'
          ? <RuleDetail rule={rules.find((r) => r.id === selectedId)} current={current} canPublish={school.isAdmin && school.modules.includes('records')} />
          : <QuestionDetail q={(list as Q[]).find((q) => q.id === selectedId)} rules={rules} current={current} canConfirm={school.isAdmin} box={box} />}
      </section>
      <TriageKeys hrefs={ids} current={selectedId ? href(box, selectedId) : null} />
    </div>
  );
}

function QuestionBadge({ q }: { q: Q }) {
  if (q.status === 'open') return <StatusBadge tone={q.differs_from_rule_id ? 'danger' : 'warning'}>{q.differs_from_rule_id ? '충돌' : '확인 대기'}</StatusBadge>;
  if (q.status === 'answered') return <StatusBadge tone="success">답변함</StatusBadge>;
  return <StatusBadge>대체됨</StatusBadge>;
}

function QuestionDetail({ q, rules, current, canConfirm, box }: { q?: Q; rules: Rule[]; current?: Rule; canConfirm: boolean; box: Box }) {
  if (!q) {
    return (
      <div className="triage-pad" data-testid="question">
        <EmptyState title={box === 'open' ? '확인할 질문이 없습니다' : '고른 질문이 없습니다'} action={<Link className="btn btn-secondary" href="/intake">자료 첨부로</Link>}>
          {current ? '확정한 규칙이 현재 자료와 일치합니다. 자료를 더 올리면 다시 분석합니다.' : '학사력이나 평가 자료를 먼저 첨부해 주세요.'}
        </EmptyState>
      </div>
    );
  }
  const result = rules.find((r) => r.question_id === q.id);
  return (
    <div className="triage-pad">
      <div className="triage-detail-head">
        <p className="fine">질문 · {when(q.created_at)} 열림{q.answered_at ? ` · ${when(q.answered_at)} ${q.status === 'answered' ? '답변' : '대체'}` : ''}</p>
        <QuestionBadge q={q} />
      </div>
      {q.status === 'open' ? (
        <div className="triage-compare">
          <section className="card" data-testid="question">
            <ReviewClient question={JSON.parse(JSON.stringify(q))} currentVersion={current?.version ?? null} canConfirm={canConfirm} />
          </section>
          <section className="card triage-current" aria-labelledby="cur-title">
            <h2 id="cur-title">지금 확정된 규칙</h2>
            {current
              ? <div data-testid={`rule-v${current.version}`}><p className="fine">{current.version}판 · {when(current.confirmed_at)} 확정 · 이후 자료 추가로 바뀌지 않습니다.</p><PeriodTable value={current.value} /></div>
              : <p className="muted">아직 확정한 규칙이 없습니다. 이 질문에 답하면 1판이 됩니다.</p>}
          </section>
        </div>
      ) : (
        <section className="card" data-testid="question">
          <h2>학기와 평가 기간의 관계</h2>
          <p className="question-text" data-testid="prompt">{q.prompt}</p>
          <h3 className="section-title">당시 추정 결과</h3>
          <PeriodTable value={q.proposal} />
          <details className="evidence" data-testid="evidence">
            <summary>추정 근거 · {q.evidence.length}행</summary>
            <ul>{q.evidence.map((e, i) => <li key={i}><span className="file">{e.file_name}</span> <span className="tag">{e.location ?? `${e.row_number}행`}</span> {e.claim}</li>)}</ul>
          </details>
          {q.status === 'answered' && result && (
            <p className="notice">이 질문의 답으로 <Link href={`/review?box=rules&id=${result.id}`}>{result.version}판</Link>을 확정했습니다 ({result.decision === 'accepted' ? '분석 결과 확인' : '관리자 수정'}).</p>
          )}
          {q.status === 'superseded' && <p className="notice">자료가 바뀌어 새 질문으로 대체됐습니다. 이 질문으로는 확정하지 않았습니다.</p>}
        </section>
      )}
    </div>
  );
}

function RuleDetail({ rule, current, canPublish }: { rule?: Rule; current?: Rule; canPublish: boolean }) {
  if (!rule) {
    return <div className="triage-pad"><EmptyState title="확정한 판이 없습니다">확인 대기 질문에 답하면 첫 판이 만들어집니다.</EmptyState></div>;
  }
  return (
    <div className="triage-pad">
      <section className="card rule" data-testid={`rule-v${rule.version}`}>
        <div className="between">
          <h2>확정한 학기 규칙 · {rule.version}판</h2>
          <StatusBadge tone={rule === current ? 'success' : 'neutral'}>{rule === current ? '사용 중' : '이전 판'}</StatusBadge>
        </div>
        <p className="fine">{when(rule.confirmed_at)} 확정 · {rule.decision === 'accepted' ? '분석 결과 확인' : '관리자 수정'} · 근거 행 {rule.evidence.length}개 · 이후 자료 추가로 바뀌지 않습니다.</p>
        <PeriodTable value={rule.value} />
        {rule.rationale && <p className="rationale"><strong>수정 근거</strong> {rule.rationale}</p>}
        {rule.question_id && <p className="fine"><Link href={`/review?box=answered&id=${rule.question_id}`}>이 판을 만든 질문 보기</Link></p>}
        {rule === current && canPublish && <Link className="btn btn-primary" href="/documents">이 규칙으로 문서 발행</Link>}
      </section>
    </div>
  );
}
