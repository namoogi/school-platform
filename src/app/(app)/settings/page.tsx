import { loadForPage } from '@/lib/page';
import { accessLog, licenseInfo, members, statements } from '@/lib/admin';
import { LicenseForm, MembersPanel } from './SettingsClient';

const ACTION: Record<string, string> = {
  'license.set': '라이선스 변경', 'member.invite': '구성원 초대', 'member.add': '구성원 추가', 'member.join': '초대 수락(로그인)',
  'member.remove': '구성원 제외', 'member.invite_revoke': '초대 취소', 'school.create': '학교 생성', 'school.status': '학교 상태 변경',
  'school.enter': '전체 관리자 입장', 'billing.statement': '청구 기록 생성', 'price.set': '기능 가격 변경',
};
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default async function SettingsPage() {
  const { school, license, team, log, bills } = await loadForPage(async ({ db, school }) => ({
    license: await licenseInfo(db, school.id),
    team: await members(db, school.id),
    log: await accessLog(db, school.id, 30),
    bills: await statements(db, school.id),
  }), { admin: true });
  const fmt = (d: string) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return (
    <>
      <div className="page-head">
        <div><h1>학교 설정</h1><p>좌석 수와 사용할 기능을 정하고 구성원을 초대합니다. 변경은 버전으로 쌓이고 청구 예정액에 반영됩니다.</p></div>
      </div>
      <div className="settings-grid">
        <section className="card" data-testid="license">
          <LicenseForm info={JSON.parse(JSON.stringify(license))} />
        </section>
        <section className="card" data-testid="members">
          <MembersPanel members={JSON.parse(JSON.stringify(team.members))} invitations={JSON.parse(JSON.stringify(team.invitations))}
            seats={license.current?.seats ?? 0} used={license.seatsUsed} />
        </section>
        <section className="card">
          <h2>청구 기록</h2>
          <p className="fine">실제 결제는 아직 연결되지 않았습니다. 전체 관리자가 월별 청구 예정액을 확정하면 여기에 남습니다.</p>
          {bills.length === 0 ? <p className="muted empty">아직 청구 기록이 없습니다.</p> : (
            <table className="grid-table">
              <thead><tr><th>청구 월</th><th>좌석</th><th>기능</th><th>금액</th></tr></thead>
              <tbody>{bills.map((b) => <tr key={b.id}><td>{b.period}</td><td>{b.seats}</td><td>{b.modules.map((k) => license.catalog.find((m) => m.key === k)?.name ?? k).join(', ')}</td><td>{won(b.amount_krw)}</td></tr>)}</tbody>
            </table>)}
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
      <p className="fine">학교: {school.name} · 상태 {school.status === 'trial' ? '시범' : school.status === 'active' ? '운영' : '이용 중지'}</p>
    </>
  );
}
