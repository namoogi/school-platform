import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, FileText, Settings, Upload, type LucideIcon } from 'lucide-react';
import { loadForPage } from '@/lib/page';
import { licenseInfo } from '@/lib/admin';
import { listDocuments, listRules, listSources, me, openQuestion } from '@/lib/services';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type Task = { key: string; title: string; note: string; href: string; done: boolean; when: '지금' | '다음' | '완료' };
type ModuleCard = {
  key: string; band: string; icon: LucideIcon; title: string; subtitle: string; status: string; tone: Tone;
  facts: [string, string][]; progress?: { label: string; value: number }; links: { href: string; label: string }[];
};

const KST = 'Asia/Seoul';
const fmtDay = (d: Date) => d.toLocaleDateString('ko-KR', { timeZone: KST, month: 'long', day: 'numeric', weekday: 'short' });
const fmtTime = (d: string) => new Date(d).toLocaleString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * 25차 홈 (ADR 0006 학사 업무형): 업무 카드 격자 + 오른쪽 할 일·최근 기록 열.
 * 모든 숫자는 이 학교의 실제 기록(RLS 범위)에서 계산한다.
 */
export default async function HomePage() {
  const { school, account, sources, question, rules, docs, license } = await loadForPage(async ({ db, school }) => ({
    account: await me(db),
    sources: school.modules.includes('intake') ? await listSources(db, school.id) : [],
    question: school.modules.includes('intake') ? await openQuestion(db, school.id) : null,
    rules: school.modules.includes('intake') ? await listRules(db, school.id) : [],
    docs: school.modules.includes('records') ? await listDocuments(db, school.id) : [],
    license: school.isAdmin ? await licenseInfo(db, school.id) : null,
  }));

  const parsed = sources.filter((s) => s.kind === 'file');
  const review = sources.filter((s) => s.needs_review);
  const rows = parsed.reduce((n, s) => n + s.row_count, 0);
  const rule = rules[0];
  const liveDocs = docs.filter((d) => !d.superseded_by);
  const intake = school.modules.includes('intake');
  const records = school.modules.includes('records');

  // ── 할 일: 지금 해야 할 일 → 다음 → 끝낸 일
  const tasks: Task[] = [];
  if (intake) {
    if (!sources.length) tasks.push({ key: 'first', title: '학사력·평가 자료 첫 등록', note: '자료 첨부', href: '/intake', done: false, when: '지금' });
    if (question) tasks.push({ key: 'q', title: question.differs_from_rule_id ? '새 자료와 확정 규칙의 차이 확인' : '학기·평가 기간 확인 질문에 답하기', note: `근거 ${question.evidence.length}행`, href: '/review', done: false, when: '지금' });
    for (const s of review) tasks.push({ key: `r-${s.id}`, title: `‘${s.name}’ 표 읽기 검토`, note: '자동 판독 정확도 확인', href: '/intake', done: false, when: '지금' });
    if (rule && records && !docs.length && school.isAdmin) tasks.push({ key: 'pub', title: `확정 규칙 ${rule.version}판으로 첫 문서 발행`, note: '학사 문서실', href: '/documents', done: false, when: '다음' });
    if (rule && records && docs.length && school.isAdmin && liveDocs[0] && liveDocs[0].snapshot.rule.version < rule.version) {
      tasks.push({ key: 'rev', title: `${rule.version}판 규칙으로 수정본 발행`, note: `현재 발행본은 ${liveDocs[0].snapshot.rule.version}판 기준`, href: '/documents', done: false, when: '다음' });
    }
    if (sources.length) tasks.push({ key: 'd-src', title: `자료 ${sources.length}건 등록`, note: `${rows}행 읽음`, href: '/intake', done: true, when: '완료' });
    if (rule) tasks.push({ key: 'd-rule', title: `규칙 ${rule.version}판 확정`, note: fmtTime(rule.confirmed_at), href: '/review', done: true, when: '완료' });
  }
  if (docs.length) tasks.push({ key: 'd-doc', title: `문서 ${docs.length}건 발행`, note: fmtTime(docs[0].published_at), href: '/documents', done: true, when: '완료' });
  const open = tasks.filter((t) => !t.done);

  // ── 업무 카드
  const cards: ModuleCard[] = [];
  if (intake) {
    cards.push({
      key: 'intake', band: '1단계', icon: Upload, title: '자료 첨부', subtitle: '학사력·평가 계획을 쌓아 둡니다',
      status: review.length ? '검토 필요' : sources.length ? '등록됨' : '시작 전', tone: review.length ? 'warning' : sources.length ? 'success' : 'neutral',
      facts: [['자료', `${sources.length}건`], ['읽은 행', `${rows}행`], ['검토 필요', `${review.length}건`]],
      links: [{ href: '/intake', label: '자료 첨부' }],
    });
    cards.push({
      key: 'review', band: '2단계', icon: ClipboardCheck, title: '관리자 확인', subtitle: '근거를 보고 규칙을 확정합니다',
      status: question ? '확인 대기' : rule ? `${rule.version}판 확정` : '질문 없음', tone: question ? 'warning' : rule ? 'success' : 'neutral',
      facts: [['대기 질문', question ? '1건' : '0건'], ['확정 판', rule ? `${rule.version}판` : '—'], ['마지막 확정', rule ? fmtTime(rule.confirmed_at) : '—']],
      links: [{ href: '/review', label: '확인 작업함' }],
    });
  }
  if (records) {
    cards.push({
      key: 'documents', band: '3단계', icon: FileText, title: '학사 문서실', subtitle: '확정한 규칙으로 문서를 발행합니다',
      status: docs.length ? `${docs.length}건 발행` : '발행 전', tone: docs.length ? 'success' : 'neutral',
      facts: [['발행본', `${docs.length}건`], ['현재 본', `${liveDocs.length}건`], ['최근 발행', docs[0] ? fmtTime(docs[0].published_at) : '—']],
      links: [{ href: '/documents', label: '문서실' }],
    });
  }
  if (license?.current) {
    const { seats } = license.current;
    cards.push({
      key: 'settings', band: '학교', icon: Settings, title: '학교 설정', subtitle: '좌석·기능·구성원',
      status: school.status === 'active' ? '운영' : school.status === 'trial' ? '시범' : '이용 중지', tone: school.status === 'suspended' ? 'danger' : school.status === 'trial' ? 'info' : 'success',
      facts: [['좌석', `${license.seatsUsed} / ${seats}석`], ['기능', `${license.current.modules.length}개`], ['라이선스', `${license.current.version}판`]],
      progress: { label: '좌석 사용', value: seats ? Math.round((license.seatsUsed / seats) * 100) : 0 },
      links: [{ href: '/settings', label: '학교 설정' }],
    });
  }
  const stepsDone = [sources.length > 0, !!rule, docs.length > 0].filter(Boolean).length;

  // ── 최근 기록 (자료·규칙·발행을 시간순으로)
  const activity = [
    ...sources.map((s) => ({ at: s.created_at, text: `자료 ‘${s.name}’ 등록` })),
    ...rules.map((r) => ({ at: r.confirmed_at, text: `규칙 ${r.version}판 확정 (${r.decision === 'accepted' ? '분석 결과 확인' : '관리자 수정'})` })),
    ...docs.map((d) => ({ at: d.published_at, text: `문서 ${d.revision_number > 1 ? `수정본 ${d.revision_number}` : '발행'} · 규칙 ${d.snapshot.rule.version}판` })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5);

  const greeting = `${account.display_name} 님`;
  const summary = open.length
    ? `지금 할 일 ${open.filter((t) => t.when === '지금').length}건${open.some((t) => t.when === '다음') ? `, 다음 할 일 ${open.filter((t) => t.when === '다음').length}건` : ''}이 있습니다.`
    : '지금 처리할 일이 없습니다. 새 자료가 오면 다시 분석합니다.';

  return (
    <div className="home" data-testid="home">
      <div className="home-main">
        <header className="home-head">
          <p className="home-date">{fmtDay(new Date())} · {school.name}</p>
          <h1>안녕하세요, {greeting}</h1>
          <p className="home-summary">{summary}</p>
        </header>

        <section aria-labelledby="work-title">
          <div className="home-section-head">
            <h2 id="work-title">학사 업무</h2>
            {intake && <span className="fine">자료 → 확인 → 발행 중 {stepsDone}단계 완료</span>}
          </div>
          <div className="work-cards">
            {cards.map((c) => (
              <article key={c.key} className="work-card" data-card={c.key} data-testid={`card-${c.key}`}>
                <div className="work-band"><c.icon size={22} aria-hidden="true" /><span>{c.band}</span></div>
                <div className="work-body">
                  <StatusBadge tone={c.tone}>{c.status}</StatusBadge>
                  <h3>{c.title}</h3>
                  <p className="fine">{c.subtitle}</p>
                  <dl className="work-facts">{c.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                  {c.progress && (
                    <div className="work-progress">
                      <span>{c.progress.label}</span><b>{c.progress.value}%</b>
                      <div className="work-track" role="progressbar" aria-label={c.progress.label} aria-valuenow={c.progress.value} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${Math.min(100, c.progress.value)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="work-foot">{c.links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</div>
              </article>
            ))}
            {cards.length === 0 && <p className="muted">이 학교에서 사용할 수 있는 업무가 없습니다. 학교 관리자에게 기능 사용을 요청하세요.</p>}
          </div>
        </section>
      </div>

      <aside className="home-side" aria-label="할 일과 최근 기록">
        <section className="side-card" data-testid="tasks">
          <div className="home-section-head"><h2>할 일</h2><span className="fine">남은 일 {open.length}건</span></div>
          {(['지금', '다음', '완료'] as const).map((when) => {
            const list = tasks.filter((t) => t.when === when);
            if (!list.length) return null;
            return (
              <div key={when} className="task-group">
                <h3>{when === '지금' ? '지금' : when === '다음' ? '다음' : '끝낸 일'}</h3>
                <ul>
                  {list.map((t) => (
                    <li key={t.key} data-done={t.done || undefined}>
                      {t.done ? <CheckCircle2 size={18} aria-hidden="true" /> : <span className="task-dot" aria-hidden="true" />}
                      <span><Link href={t.href}>{t.title}</Link><small>{t.done ? '완료 · ' : ''}{t.note}</small></span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!tasks.length && <p className="muted">할 일이 없습니다.</p>}
        </section>
        <section className="side-card">
          <div className="home-section-head"><h2>최근 기록</h2></div>
          {activity.length ? (
            <ol className="activity">
              {activity.map((a, i) => <li key={i}><span>{a.text}</span><time dateTime={a.at}>{fmtTime(a.at)}</time></li>)}
            </ol>
          ) : <p className="muted">아직 기록이 없습니다.</p>}
        </section>
      </aside>
    </div>
  );
}
