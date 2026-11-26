import { loadForPlatform } from '@/lib/page';
import { latestBaseline, latestReports, offerCounts } from '@/lib/baseline';
import { Kpi, PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';

const STATUS: Record<string, string> = { offered: '제안 중', accepted: '수락', declined: '거절', held: '보류' };

/**
 * 76차 ADR 0027: 관제 기본판·보고. 기본판은 판으로 내고, 학교에는 '제안'으로 간다(학교가 수락하면 추가할 것만 반영, 학교가 고친 값과 부딪치면 학교 값 유지).
 * 학교 정보는 보고 계약(app.school_report_v1) 스냅샷으로만 모은다 — 학교 내부 표를 직접 읽지 않는다.
 */
export default async function BaselinePage() {
  const { base, reports, offers } = await loadForPlatform(async ({ db }) => ({
    base: await latestBaseline(db), reports: await latestReports(db), offers: await offerCounts(db),
  }));
  const m = base?.manifest ?? {};
  const sum = (k: 'students_enrolled' | 'offerings' | 'closures' | 'people') => reports.reduce((n, r) => n + Number(r.data.counts?.[k] ?? 0), 0);
  const behind = reports.filter((r) => base && (r.data.baseline_version ?? 0) < base.version).length;
  const byVersion = [...new Set(offers.map((o) => o.to_version))];
  return (
    <>
      <PageHeader title="기본판·보고" crumbs={[{ label: '전체 관리' }, { label: '기본판·보고' }]}
        description="관제 기본판(코드 목록·척도·성적 정책)을 판으로 내면 각 학교에 제안으로 갑니다. 학교 현황은 보고 계약 스냅샷으로만 모읍니다." />
      <div className="kpis" data-testid="report-kpis">
        <Kpi label="보고한 학교" value={String(reports.length)} hint={reports[0] ? `최근 ${new Date(reports.map((r) => r.collected_at).sort().at(-1)!).toLocaleString('ko-KR')}` : '아직 모으지 않음'} />
        <Kpi label="재학생(합)" value={String(sum('students_enrolled'))} hint={`사람 ${sum('people')}`} />
        <Kpi label="개설·마감(합)" value={`${sum('offerings')} · ${sum('closures')}`} />
        <Kpi label="기본판 뒤처진 학교" value={String(behind)} tone={behind ? 'warning' : undefined} hint={base ? `최신 ${base.version}판` : '기본판 없음'} />
      </div>
      <section className="card stack" data-testid="reports">
        <div className="card-header"><h2>학교 보고</h2>
          <ActionForm url="/api/admin/baseline" action="collect" fields={[]} submitLabel="지금 모으기" successText="보고를 모았습니다." testId="collect-reports" /></div>
        {reports.length === 0 ? <p className="muted">모은 보고가 없습니다.</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="학교 보고 표(옆으로 넘겨 보기)"><table className="grid-table">
            <thead><tr><th scope="col">학교</th><th scope="col">상태</th><th scope="col">기본판</th><th scope="col">재학</th><th scope="col">교직원</th><th scope="col">개설</th><th scope="col">마감</th><th scope="col">홈페이지 항목</th><th scope="col">모은 때</th></tr></thead>
            <tbody>{reports.map((r) => (
              <tr key={r.school_id}><th scope="row">{r.data.school.name}</th><td>{r.data.school.status}</td>
                <td>{r.data.baseline_version ?? '-'}{base && (r.data.baseline_version ?? 0) < base.version ? <> <StatusBadge tone="warning">뒤처짐</StatusBadge></> : null}</td>
                <td>{r.data.counts.students_enrolled}</td><td>{r.data.counts.staff_active}</td><td>{r.data.counts.offerings}</td><td>{r.data.counts.closures}</td><td>{r.data.counts.site_entries}</td>
                <td>{new Date(r.collected_at).toLocaleString('ko-KR')}</td></tr>))}</tbody>
          </table></div>)}
        <p className="fine">계약 {reports[0]?.contract ?? 'school-report/1'}. 계약을 바꾸려면 새 판을 만들고 한동안 둘 다 냅니다.</p>
      </section>
      <section className="card stack" data-testid="baseline">
        <h2>관제 기본판 {base ? <StatusBadge tone="success">{base.version}판</StatusBadge> : null}</h2>
        {base ? <p className="fine">{base.title}{base.why ? ` · ${base.why}` : ''} · 코드 {m.code_lists?.length ?? 0} · 척도 {m.scales?.length ?? 0} · 성적 정책 {m.grading_policy ? '있음' : '없음'}</p> : <p className="muted">기본판이 없습니다.</p>}
        {byVersion.length > 0 && <ul className="issue-list">{byVersion.map((v) => (
          <li key={v}><span><strong>{v}판 제안</strong> <small className="muted">{offers.filter((o) => o.to_version === v).map((o) => `${STATUS[o.status] ?? o.status} ${o.n}`).join(' · ')}</small></span></li>))}</ul>}
        <details><summary>새 판 내기(JSON)</summary>
          <ActionForm url="/api/admin/baseline" action="publish" extra={{ base_version: base?.version ?? 0 }} submitLabel="새 기본판 내기" successText="새 기본판을 냈습니다. 학교마다 제안이 갑니다." testId="baseline-form"
            confirmText="새 기본판을 낼까요? 모든 학교에 갱신 제안이 갑니다(학교가 수락해야 반영)."
            fields={[{ name: 'title', label: '제목', required: true, defaultValue: base?.title ?? '' }, { name: 'why', label: '왜(바꾼 이유)', required: true, width: 'wide' },
              { name: 'manifest', label: '내용(코드 목록·척도·성적 정책)', type: 'textarea', required: true, width: 'wide', defaultValue: JSON.stringify(m, null, 2) }]} />
        </details>
      </section>
    </>
  );
}
