import { loadForPage } from '@/lib/page';
import { accessLog, licenseInfo, members, statements } from '@/lib/admin';
import { LINK_KINDS, listLinks } from '@/lib/devlinks';
import { LicenseForm, MembersPanel, PortalAccountsPanel } from './SettingsClient';
import { listPortalAccounts } from '@/lib/portal';
import { listPeople } from '@/lib/people';
import { PageHeader, StatusBadge } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { estimate, fmtBytes, schoolUsage, usd } from '@/lib/usage';

const ACTION: Record<string, string> = {
  'license.set': '라이선스 변경', 'member.invite': '구성원 초대', 'member.add': '구성원 추가', 'member.join': '초대 수락(로그인)',
  'member.remove': '구성원 제외', 'member.invite_revoke': '초대 취소', 'school.create': '학교 생성', 'school.status': '학교 상태 변경',
  'school.enter': '전체 관리자 입장', 'billing.statement': '청구 기록 생성', 'price.set': '기능 가격 변경', 'devlink.add': '개발 연동 추가', 'devlink.update': '개발 연동 변경',
  'portal.account_add': '열람 계정 만들기', 'portal.account_end': '열람 계정 끝내기', 'portal.claim': '열람 계정 연결(로그인)',
};
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default async function SettingsPage() {
  const { school, license, team, log, bills, links, usage, portal, people } = await loadForPage(async ({ db, school }) => ({
    license: await licenseInfo(db, school.id),
    team: await members(db, school.id),
    log: await accessLog(db, school.id, 30),
    bills: await statements(db, school.id),
    links: await listLinks(db, school.id),
    usage: (await schoolUsage(db, school.id))[0],
    portal: await listPortalAccounts(db, school.id),
    people: (await listPeople(db, school.id)).map((p) => ({ id: p.id, name: p.name })),
  }), { admin: true });
  const fmt = (d: string) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return (
    <>
      <PageHeader title="학교 설정" crumbs={[{ label: '학교 관리' }, { label: '학교 설정' }]}
        description="좌석 수와 사용할 기능을 정하고 구성원을 초대합니다. 변경은 판으로 쌓이고 청구 예정액에 반영됩니다."
        status={<StatusBadge tone={school.status === 'active' ? 'success' : school.status === 'trial' ? 'info' : 'danger'}>{school.status === 'trial' ? '시범' : school.status === 'active' ? '운영' : '이용 중지'}</StatusBadge>}
        meta={<><span>{school.name}</span>{license.current && <span>라이선스 {license.current.version}판</span>}</>} />
      {usage && (() => { const e = estimate(usage); return (
        <section className="card" data-testid="school-usage">
          <div className="card-header"><h2>우리 학교 사용량</h2><span className="fine">최근 30일 · USD 추정, 청구서 아님</span></div>
          <div className="kpis">
            <div className="kpi"><span className="kpi-label">파일 저장</span><span className="kpi-value">{fmtBytes(usage.db_site_bytes + usage.db_source_bytes + usage.r2_bytes)}</span><span className="muted small-text">{usage.files}개</span></div>
            <div className="kpi"><span className="kpi-label">AI 사용</span><span className="kpi-value">{usage.ai_calls_30d}회</span><span className="muted small-text">토큰 {usage.ai_tokens_30d.toLocaleString('ko-KR')}</span></div>
            <div className="kpi"><span className="kpi-label">외부 에이전트 작업</span><span className="kpi-value">{usage.agent_actions_30d}회</span><span className="muted small-text">학교 구독으로 처리</span></div>
            <div className="kpi"><span className="kpi-label">월 추정</span><span className="kpi-value">{usd(e.total)}</span><span className="muted small-text">저장 {usd(e.db + e.r2)} · AI {usd(e.ai)}</span></div>
          </div>
        </section>
      ); })()}
      <div className="settings-grid">
        <section className="card" data-testid="license">
          <LicenseForm info={JSON.parse(JSON.stringify(license))} />
        </section>
        <section className="card" data-testid="members">
          <MembersPanel members={JSON.parse(JSON.stringify(team.members))} invitations={JSON.parse(JSON.stringify(team.invitations))}
            seats={license.current?.seats ?? 0} used={license.seatsUsed} />
        </section>
        <section className="card" data-testid="portal-accounts">
          <PortalAccountsPanel accounts={JSON.parse(JSON.stringify(portal))} people={people} />
        </section>
        <section className="card" data-testid="school-dev-links">
          <h2>개발 연동</h2>
          <p className="fine">이 학교 전용 개발 자원입니다. 연결·변경은 전체 관리자가 합니다.</p>
          {links.length === 0 ? <p className="muted">연결된 자원이 없습니다.</p> : (
            <ul className="sources">{links.map((l) => (
              <li key={l.id}><div><strong>{l.label}</strong><small>{LINK_KINDS[l.kind].label} · <a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></small></div></li>
            ))}</ul>)}
        </section>
        <section className="card">
          <h2>청구 기록</h2>
          <p className="fine">실제 결제는 아직 연결되지 않았습니다. 전체 관리자가 월별 청구 예정액을 확정하면 여기에 남습니다.</p>
          <DataTable caption="청구 기록" testId="bill-table" empty="아직 청구 기록이 없습니다." initialSort={{ key: 'period', dir: 'desc' }}
            columns={[{ key: 'period', header: '청구 월', sortable: true }, { key: 'seats', header: '좌석', num: true, sortable: true },
              { key: 'modules', header: '기능' }, { key: 'amount', header: '금액', num: true, sortable: true }]}
            rows={bills.map((b) => ({
              id: b.id,
              sort: { period: b.period, seats: b.seats, amount: b.amount_krw },
              cells: { period: b.period, seats: b.seats, modules: b.modules.map((k) => license.catalog.find((m) => m.key === k)?.name ?? k).join(', '), amount: won(b.amount_krw) },
            }))} />
        </section>
        <section className="card">
          <h2>접근·변경 기록</h2>
          <p className="fine">전체 관리자가 이 학교에 들어온 기록도 여기에 남습니다.</p>
          <ul className="log" data-testid="access-log">
            {log.map((e) => (
              <li key={e.id}><time>{fmt(e.created_at)}</time> <strong>{e.actor_label}</strong> · {ACTION[e.action] ?? e.action}
                {typeof e.detail?.email === 'string' && <span className="muted"> · {e.detail.email}</span>}</li>
            ))}
            {log.length === 0 && <li className="muted">기록이 없습니다.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
