import Link from 'next/link';
import { Archive, CheckCheck, FileStack, Inbox, type LucideIcon } from 'lucide-react';
import { loadForPage } from '@/lib/page';
import { flowProgress, listQuestions, listRules, type Question, type Rule } from '@/lib/services';
import { EmptyState, LEARNING_STEPS, StatusBadge, Steps } from '@/components/ui';
import { PeriodTable } from '@/components/PeriodTable';
import { ReviewClient } from './ReviewClient';
import { TriageKeys } from './TriageKeys';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { Translate } from '@/lib/i18n/base';

export const dynamic = 'force-dynamic';

type Box = 'open' | 'answered' | 'superseded' | 'rules';
type Q = Question & { answered_at: string | null };
// 함 이름은 사전의 review.box.<함>
const BOXES: { key: Box; icon: LucideIcon }[] = [
  { key: 'open', icon: Inbox },
  { key: 'answered', icon: CheckCheck },
  { key: 'superseded', icon: Archive },
  { key: 'rules', icon: FileStack },
];
// 화면 언어 t·날짜 형식을 아래 부품에 한 번에 넘긴다. 시간대는 아직 서울 고정
type Fmt = { t: Translate; when: (d: string) => string };
const KST = 'Asia/Seoul';
const how = (t: Translate, d: string) => t(d === 'accepted' ? 'rule.decision.accepted' : 'rule.decision.edited');

/**
 * 관리자 확인 (25차, ADR 0006 3단 작업함): 함 → 목록 → 상세.
 * 확인 대기 질문은 근거와 지금 확정된 판을 나란히 보고 바로 결정한다. 확정은 언제나 새 판으로 쌓인다.
 * 선택 상태는 주소(?box=&id=)에 담아 새로 고침·공유해도 같은 화면이 열린다.
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ box?: string; id?: string }> }) {
  const sp = await searchParams;
  const { questions, rules, school, done, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    questions: await listQuestions(db, school.id),
    rules: await listRules(db, school.id),
    done: await flowProgress(db, school.id),
  }), { module: 'intake' });

  const { t, lang } = await getI18n(uiLang);
  const when = (d: string) => new Date(d).toLocaleString(lang, { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const f: Fmt = { t, when };
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
          <h1>{t('steps.review')}</h1>
          <p className="fine">{t('review.lead')}</p>
        </div>
        <Steps current="review" done={done} items={LEARNING_STEPS} />
      </header>

      <nav className="triage-boxes" aria-label={t('review.boxes')}>
        {BOXES.map((b) => (
          <Link key={b.key} href={href(b.key)} className="triage-box" aria-current={b.key === box ? 'page' : undefined}>
            <b.icon size={18} aria-hidden="true" /><span>{t(`review.box.${b.key}`)}</span><span className="triage-count">{byBox[b.key].length}</span>
          </Link>
        ))}
        <p className="triage-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> {t('review.keys')}</p>
      </nav>

      <section className="triage-list" aria-label={t('review.listOf', { box: t(`review.box.${box}`) })}>
        <ul>
          {box === 'rules'
            ? rules.map((r) => (
              <li key={r.id}>
                <Link href={href(box, r.id)} className="triage-item" aria-current={r.id === selectedId ? 'true' : undefined}>
                  <span className="triage-item-top">
                    <StatusBadge tone={r === current ? 'success' : 'neutral'}>{t(r === current ? 'common.inUse' : 'common.previousVersion')}</StatusBadge>
                    <span className="triage-time">{when(r.confirmed_at)}</span>
                  </span>
                  <span className="triage-item-title">{t('review.ruleItem', { v: r.version, how: how(t, r.decision) })}</span>
                  <span className="triage-item-sub">{r.value.periods.map((p) => p.label).join(' · ')}</span>
                </Link>
              </li>))
            : (list as Q[]).map((q) => (
              <li key={q.id}>
                <Link href={href(box, q.id)} className="triage-item" aria-current={q.id === selectedId ? 'true' : undefined}>
                  <span className="triage-item-top">
                    <QuestionBadge q={q} t={t} />
                    <span className="triage-time">{when(q.created_at)}</span>
                  </span>
                  <span className="triage-item-title">{t(q.differs_from_rule_id ? 'review.q.differs' : 'review.q.relation')}</span>
                  <span className="triage-item-sub">{t('review.q.sub', { n: q.evidence.length })}{q.issues.length ? t('review.q.issues', { n: q.issues.length }) : ''}</span>
                </Link>
              </li>))}
        </ul>
        {list.length === 0 && (
          <p className="triage-empty">{t(box === 'open' ? 'review.emptyOpen' : box === 'rules' ? 'review.emptyRules' : 'review.emptyBox')}</p>
        )}
      </section>

      <section className="triage-detail" aria-label={t('review.detail')}>
        {box === 'rules'
          ? <RuleDetail f={f} rule={rules.find((r) => r.id === selectedId)} current={current} canPublish={school.isAdmin && school.modules.includes('records')} />
          : <QuestionDetail f={f} q={(list as Q[]).find((q) => q.id === selectedId)} rules={rules} current={current} canConfirm={school.isAdmin} box={box} />}
      </section>
      <TriageKeys hrefs={ids} current={selectedId ? href(box, selectedId) : null} />
    </div>
  );
}

function QuestionBadge({ q, t }: { q: Q; t: Translate }) {
  if (q.status === 'open') return <StatusBadge tone={q.differs_from_rule_id ? 'danger' : 'warning'}>{t(q.differs_from_rule_id ? 'review.badge.conflict' : 'review.box.open')}</StatusBadge>;
  if (q.status === 'answered') return <StatusBadge tone="success">{t('review.box.answered')}</StatusBadge>;
  return <StatusBadge>{t('review.badge.superseded')}</StatusBadge>;
}

function QuestionDetail({ f: { t, when }, q, rules, current, canConfirm, box }: { f: Fmt; q?: Q; rules: Rule[]; current?: Rule; canConfirm: boolean; box: Box }) {
  if (!q) {
    return (
      <div className="triage-pad" data-testid="question">
        <EmptyState title={t(box === 'open' ? 'review.noOpenTitle' : 'review.noPickTitle')} action={<Link className="btn btn-secondary" href="/intake">{t('review.toIntake')}</Link>}>
          {t(current ? 'review.matches' : 'review.uploadFirst')}
        </EmptyState>
      </div>
    );
  }
  const result = rules.find((r) => r.question_id === q.id);
  return (
    <div className="triage-pad">
      <div className="triage-detail-head">
        <p className="fine">{t('review.openedAt', { when: when(q.created_at) })}{q.answered_at ? t(q.status === 'answered' ? 'review.answeredAt' : 'review.supersededAt', { when: when(q.answered_at) }) : ''}</p>
        <QuestionBadge q={q} t={t} />
      </div>
      {q.status === 'open' ? (
        <div className="triage-compare">
          <section className="card" data-testid="question">
            <ReviewClient question={JSON.parse(JSON.stringify(q))} currentVersion={current?.version ?? null} canConfirm={canConfirm} />
          </section>
          <section className="card triage-current" aria-labelledby="cur-title">
            <h2 id="cur-title">{t('review.currentRule')}</h2>
            {current
              ? <div data-testid={`rule-v${current.version}`}><p className="fine">{t('review.currentMeta', { v: current.version, when: when(current.confirmed_at) })}</p><PeriodTable value={current.value} /></div>
              : <p className="muted">{t('review.noRuleYet')}</p>}
          </section>
        </div>
      ) : (
        <section className="card" data-testid="question">
          <h2>{t('review.q.relation')}</h2>
          <p className="question-text" data-testid="prompt">{q.prompt}</p>
          <h3 className="section-title">{t('review.proposalThen')}</h3>
          <PeriodTable value={q.proposal} />
          <details className="evidence" data-testid="evidence">
            <summary>{t('review.evidence', { n: q.evidence.length })}</summary>
            <ul>{q.evidence.map((e, i) => <li key={i}><span className="file">{e.file_name}</span> <span className="tag">{e.location ?? t('review.rowN', { n: e.row_number })}</span> {e.claim}</li>)}</ul>
          </details>
          {q.status === 'answered' && result && (
            <p className="notice"><AnsweredWith t={t} href={`/review?box=rules&id=${result.id}`} v={result.version} how={how(t, result.decision)} /></p>
          )}
          {q.status === 'superseded' && <p className="notice">{t('review.supersededNote')}</p>}
        </section>
      )}
    </div>
  );
}

/** 문장 속 링크: 번역문의 {version} 자리에 판 링크를 끼운다(언어마다 어순이 달라 문장을 쪼개지 않는다) */
function AnsweredWith({ t, href, v, how: h }: { t: Translate; href: string; v: number; how: string }) {
  const [before, after = ''] = t('review.answeredWith', { how: h }).split('{version}');
  return <>{before}<Link href={href}>{t('common.version', { v })}</Link>{after}</>;
}

function RuleDetail({ f: { t, when }, rule, current, canPublish }: { f: Fmt; rule?: Rule; current?: Rule; canPublish: boolean }) {
  if (!rule) {
    return <div className="triage-pad"><EmptyState title={t('review.noRulesTitle')}>{t('review.noRulesBody')}</EmptyState></div>;
  }
  return (
    <div className="triage-pad">
      <section className="card rule" data-testid={`rule-v${rule.version}`}>
        <div className="between">
          <h2>{t('review.ruleTitle', { v: rule.version })}</h2>
          <StatusBadge tone={rule === current ? 'success' : 'neutral'}>{t(rule === current ? 'common.inUse' : 'common.previousVersion')}</StatusBadge>
        </div>
        <p className="fine">{t('review.ruleMeta', { when: when(rule.confirmed_at), how: how(t, rule.decision), n: rule.evidence.length })}</p>
        <PeriodTable value={rule.value} />
        {rule.rationale && <p className="rationale"><strong>{t('review.rationale')}</strong> {rule.rationale}</p>}
        {rule.question_id && <p className="fine"><Link href={`/review?box=answered&id=${rule.question_id}`}>{t('review.ruleQuestion')}</Link></p>}
        {rule === current && canPublish && <Link className="btn btn-primary" href="/documents">{t('review.publish')}</Link>}
      </section>
    </div>
  );
}
