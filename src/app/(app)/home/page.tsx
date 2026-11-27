import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, FileText, Settings, Upload, type LucideIcon } from 'lucide-react';
import { loadForPage } from '@/lib/page';
import { licenseInfo } from '@/lib/admin';
import { listDocuments, listRules, listSources, me, openQuestion } from '@/lib/services';
import { StatusBadge } from '@/components/ui';
import { getI18n, userLang } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type When = 'now' | 'next' | 'done';
type Task = { key: string; title: string; note: string; href: string; done: boolean; when: When };
type ModuleCard = {
  key: string; band: string; icon: LucideIcon; title: string; subtitle: string; status: string; tone: Tone;
  facts: [string, string][]; progress?: { label: string; value: number }; links: { href: string; label: string }[];
};

// 날짜는 화면 언어 형식으로. 시간대는 아직 서울 고정(학교 시간대 설정이 생기면 그것을 쓴다)
const KST = 'Asia/Seoul';

/**
 * 25차 홈 (ADR 0006 학사 업무형): 업무 카드 격자 + 오른쪽 할 일·최근 기록 열.
 * 모든 숫자는 이 학교의 실제 기록(RLS 범위)에서 계산한다.
 */
export default async function HomePage() {
  const { school, account, sources, question, rules, docs, license, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    account: await me(db),
    sources: school.modules.includes('intake') ? await listSources(db, school.id) : [],
    question: school.modules.includes('intake') ? await openQuestion(db, school.id) : null,
    rules: school.modules.includes('intake') ? await listRules(db, school.id) : [],
    docs: school.modules.includes('records') ? await listDocuments(db, school.id) : [],
    license: school.isAdmin ? await licenseInfo(db, school.id) : null,
  }));

  const { t, locale } = await getI18n(uiLang, school.locale);
  const fmtDay = (d: Date) => d.toLocaleDateString(locale, { timeZone: KST, month: 'long', day: 'numeric', weekday: 'short' });
  const fmtTime = (d: string) => new Date(d).toLocaleString(locale, { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const v = (n: number) => t('common.version', { v: n });
  const how = (d: string) => t(d === 'accepted' ? 'rule.decision.accepted' : 'rule.decision.edited');
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
    if (!sources.length) tasks.push({ key: 'first', title: t('home.task.first'), note: t('steps.intake'), href: '/intake', done: false, when: 'now' });
    if (question) tasks.push({ key: 'q', title: t(question.differs_from_rule_id ? 'home.task.ruleDiff' : 'home.task.answer'), note: t('home.task.evidenceRows', { n: question.evidence.length }), href: '/review', done: false, when: 'now' });
    for (const s of review) tasks.push({ key: `r-${s.id}`, title: t('home.task.reviewSource', { name: s.name }), note: t('home.task.reviewSourceNote'), href: '/intake', done: false, when: 'now' });
    if (rule && records && !docs.length && school.isAdmin) tasks.push({ key: 'pub', title: t('home.task.firstIssue', { v: rule.version }), note: t('nav.documents.title'), href: '/documents', done: false, when: 'next' });
    if (rule && records && docs.length && school.isAdmin && liveDocs[0] && liveDocs[0].snapshot.rule.version < rule.version) {
      tasks.push({ key: 'rev', title: t('home.task.revise', { v: rule.version }), note: t('home.task.reviseNote', { v: liveDocs[0].snapshot.rule.version }), href: '/documents', done: false, when: 'next' });
    }
    if (sources.length) tasks.push({ key: 'd-src', title: t('home.task.sourcesDone', { n: sources.length }), note: t('home.task.rowsRead', { n: rows }), href: '/intake', done: true, when: 'done' });
    if (rule) tasks.push({ key: 'd-rule', title: t('home.task.ruleDone', { v: rule.version }), note: fmtTime(rule.confirmed_at), href: '/review', done: true, when: 'done' });
  }
  if (docs.length) tasks.push({ key: 'd-doc', title: t('home.task.docsDone', { n: docs.length }), note: fmtTime(docs[0].published_at), href: '/documents', done: true, when: 'done' });
  const open = tasks.filter((x) => !x.done);

  // ── 업무 카드
  const cards: ModuleCard[] = [];
  if (intake) {
    cards.push({
      key: 'intake', band: t('home.band.step', { n: 1 }), icon: Upload, title: t('steps.intake'), subtitle: t('home.card.intake.sub'),
      status: t(review.length ? 'home.status.needsReview' : sources.length ? 'home.status.registered' : 'home.status.notStarted'), tone: review.length ? 'warning' : sources.length ? 'success' : 'neutral',
      facts: [[t('home.fact.files'), t('common.countItems', { n: sources.length })], [t('home.fact.rowsRead'), t('common.countRows', { n: rows })], [t('home.status.needsReview'), t('common.countItems', { n: review.length })]],
      links: [{ href: '/intake', label: t('steps.intake') }],
    });
    cards.push({
      key: 'review', band: t('home.band.step', { n: 2 }), icon: ClipboardCheck, title: t('steps.review'), subtitle: t('home.card.review.sub'),
      status: question ? t('home.status.pending') : rule ? t('home.status.confirmedV', { v: rule.version }) : t('home.status.noQuestion'), tone: question ? 'warning' : rule ? 'success' : 'neutral',
      facts: [[t('home.fact.openQuestions'), t('common.countItems', { n: question ? 1 : 0 })], [t('home.fact.confirmedVersion'), rule ? v(rule.version) : '—'], [t('home.fact.lastConfirmed'), rule ? fmtTime(rule.confirmed_at) : '—']],
      links: [{ href: '/review', label: t('home.link.reviewQueue') }],
    });
  }
  if (records) {
    cards.push({
      key: 'documents', band: t('home.band.step', { n: 3 }), icon: FileText, title: t('nav.documents.title'), subtitle: t('home.card.documents.sub'),
      status: docs.length ? t('home.status.issuedN', { n: docs.length }) : t('home.status.notIssued'), tone: docs.length ? 'success' : 'neutral',
      facts: [[t('home.fact.issued'), t('common.countItems', { n: docs.length })], [t('home.fact.current'), t('common.countItems', { n: liveDocs.length })], [t('home.fact.lastIssued'), docs[0] ? fmtTime(docs[0].published_at) : '—']],
      links: [{ href: '/documents', label: t('home.link.documents') }],
    });
  }
  if (license?.current) {
    const { seats } = license.current;
    cards.push({
      key: 'settings', band: t('nav.group.school'), icon: Settings, title: t('nav.settings.title'), subtitle: t('home.card.settings.sub'),
      status: t(school.status === 'active' ? 'home.status.active' : school.status === 'trial' ? 'switcher.trial' : 'switcher.suspended'), tone: school.status === 'suspended' ? 'danger' : school.status === 'trial' ? 'info' : 'success',
      facts: [[t('home.fact.seats'), t('home.seatsOf', { used: license.seatsUsed, seats })], [t('home.fact.features'), t('common.countN', { n: license.current.modules.length })], [t('home.fact.license'), v(license.current.version)]],
      progress: { label: t('home.seatsUsed'), value: seats ? Math.round((license.seatsUsed / seats) * 100) : 0 },
      links: [{ href: '/settings', label: t('nav.settings.title') }],
    });
  }
  const stepsDone = [sources.length > 0, !!rule, docs.length > 0].filter(Boolean).length;

  // ── 최근 기록 (자료·규칙·발행을 시간순으로)
  const activity = [
    ...sources.map((s) => ({ at: s.created_at, text: t('home.act.source', { name: s.name }) })),
    ...rules.map((r) => ({ at: r.confirmed_at, text: t('home.act.rule', { v: r.version, how: how(r.decision) }) })),
    ...docs.map((d) => ({ at: d.published_at, text: d.revision_number > 1 ? t('home.act.docRevision', { n: d.revision_number, v: d.snapshot.rule.version }) : t('home.act.docIssued', { v: d.snapshot.rule.version }) })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 5);

  const nowN = open.filter((x) => x.when === 'now').length;
  const nextN = open.filter((x) => x.when === 'next').length;
  const summary = !open.length ? t('home.summaryNone') : nextN ? t('home.summaryWithNext', { now: nowN, next: nextN }) : t('home.summary', { now: nowN });

  return (
    <div className="home" data-testid="home">
      <div className="home-main">
        <header className="home-head">
          <p className="home-date">{fmtDay(new Date())} · {school.name}</p>
          <h1>{t('home.greeting', { name: account.display_name })}</h1>
          <p className="home-summary">{summary}{open.length > 0 && <> <a href="#tasks" className="home-jump">{t('home.jump')}</a></>}</p>
        </header>

        <section aria-labelledby="work-title">
          <div className="home-section-head">
            <h2 id="work-title">{t('home.work')}</h2>
            {intake && <span className="fine">{t('home.stepsDone', { n: stepsDone })}</span>}
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
            {cards.length === 0 && <p className="muted">{t('home.noModules')}</p>}
          </div>
        </section>
      </div>

      <aside className="home-side" aria-label={t('home.side')}>
        <section className="side-card" id="tasks" data-testid="tasks">
          <div className="home-section-head"><h2>{t('home.tasks')}</h2><span className="fine">{t('home.remaining', { n: open.length })}</span></div>
          {(['now', 'next', 'done'] as const).map((when) => {
            const list = tasks.filter((x) => x.when === when);
            if (!list.length) return null;
            return (
              <div key={when} className="task-group">
                <h3>{t(`home.when.${when}`)}</h3>
                <ul>
                  {list.map((x) => (
                    <li key={x.key} data-done={x.done || undefined}>
                      {x.done ? <CheckCircle2 size={18} aria-hidden="true" /> : <span className="task-dot" aria-hidden="true" />}
                      <span><Link href={x.href}>{x.title}</Link><small>{x.done ? t('home.doneNote') : ''}{x.note}</small></span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!tasks.length && <p className="muted">{t('home.noTasks')}</p>}
        </section>
        <section className="side-card">
          <div className="home-section-head"><h2>{t('home.recent')}</h2></div>
          {activity.length ? (
            <ol className="activity">
              {activity.map((a, i) => <li key={i}><span>{a.text}</span><time dateTime={a.at}>{fmtTime(a.at)}</time></li>)}
            </ol>
          ) : <p className="muted">{t('home.noActivity')}</p>}
        </section>
      </aside>
    </div>
  );
}
