import { loadForPlatform } from '@/lib/page';
import { accessLog, catalog, overview, statements } from '@/lib/admin';
import { EnterSchoolButton } from '@/components/SchoolSwitcher';
import { Kpi, PageHeader, StatusBadge } from '@/components/ui';
import { CreateSchoolForm, PriceForm, SchoolActions } from './AdminClient';

const won = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('ko-KR')}원`);
const STATUS: Record<string, string> = { trial: '시범', active: '운영', suspended: '이용 중지' };
const ACTION: Record<string, string> = {
  'license.set': '라이선스 변경', 'member.invite': '구성원 초대', 'member.add': '구성원 추가', 'member.join': '초대 수락(로그인)',
  'member.remove': '구성원 제외', 'member.invite_revoke': '초대 취소', 'school.create': '학교 생성', 'school.status': '학교 상태 변경',
  'school.enter': '전체 관리자 입장', 'billing.statement': '청구 기록 생성', 'price.set': '기능 가격 변경',
};

export default async function AdminPage() {
  const { schools, modules, log, bills } = await loadForPlatform(async ({ db }) => ({
    schools: await overview(db), modules: await catalog(db), log: await accessLog(db, null, 40), bills: await statements(db, null),
  }));
  const names = Object.fromEntries(schools.map((s) => [s.id, s.name]));
  const moduleName = Object.fromEntries(modules.map((m) => [m.key, m.name]));
  const totalSeats = schools.reduce((n, s) => n + (s.seats ?? 0), 0);
  const monthly = schools.filter((s) => s.status !== 'suspended').reduce((n, s) => n + (s.monthly_estimate_krw ?? 0), 0);
  const period = new Date().toISOString().slice(0, 7);
  const fmt = (d: string) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return (
    <>
      <PageHeader title="학교·라이선스" crumbs={[{ label: '전체 관리' }, { label: '학교·라이선스' }]}
        description="학교를 만들고 라이선스·상태·가격·청구를 관리합니다. 학교에 들어가면 그 학교 화면을 그대로 볼 수 있고, 입장은 학교 기록에 남습니다." />
      <div className="kpis" data-testid="platform-summary">
        <Kpi label="학교" value={`${schools.length}곳`} hint={`시범 ${schools.filter((s) => s.status === 'trial').length} · 이용 중지 ${schools.filter((s) => s.status === 'suspended').length}`} />
        <Kpi label="좌석" value={`${totalSeats}석`} hint={`사용 ${schools.reduce((n, s) => n + s.seats_used, 0)}석`} />
        <Kpi label="월 청구 예정" value={won(monthly)} hint="이용 중지 학교 제외" />
        <Kpi label="확인 대기 질문" value={`${schools.reduce((n, s) => n + s.open_questions, 0)}건`} tone={schools.some((s) => s.open_questions) ? 'warning' : undefined} />
      </div>
      <section className="card">
        <div className="card-header"><h2>학교</h2><span className="fine">{schools.length}곳</span></div>
        <div className="table-wrap">
          <table className="grid-table" data-testid="school-table">
            <thead><tr><th scope="col">학교</th><th scope="col">상태</th><th scope="col" className="num">좌석</th><th scope="col">기능</th><th scope="col" className="num">월 예정액</th><th scope="col" className="num">자료·문서·질문</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><br /><small className="muted">{s.slug} · {s.locale}</small></td>
                  <td><StatusBadge tone={s.status === 'active' ? 'success' : s.status === 'trial' ? 'info' : 'danger'}>{STATUS[s.status]}</StatusBadge></td>
                  <td className="num">{s.seats_used} / {s.seats ?? '—'}</td>
                  <td>{(s.modules ?? []).map((k) => moduleName[k] ?? k).join(', ')}</td>
                  <td className="num">{won(s.monthly_estimate_krw)}</td>
                  <td className="num">{s.sources} · {s.documents} · {s.open_questions ? <StatusBadge tone="warning">{s.open_questions}</StatusBadge> : 0}</td>
                  <td><div className="actions"><EnterSchoolButton schoolId={s.id} /><SchoolActions schoolId={s.id} status={s.status} period={period} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid-2">
        <section className="card"><CreateSchoolForm modules={JSON.parse(JSON.stringify(modules))} /></section>
        <section className="card"><PriceForm modules={JSON.parse(JSON.stringify(modules))} /></section>
        <section className="card">
          <h2>청구 기록</h2>
          <p className="fine">청구 예정액 확정 기록입니다. 실제 결제 연동은 결제 대행사를 정한 뒤 따로 진행합니다.</p>
          {bills.length === 0 ? <p className="muted empty">아직 없습니다.</p> : (
            <table className="grid-table"><thead><tr><th>월</th><th>학교</th><th>좌석</th><th>금액</th></tr></thead>
              <tbody>{bills.map((b) => <tr key={b.id}><td>{b.period}</td><td>{names[b.school_id] ?? b.school_id.slice(0, 8)}</td><td>{b.seats}</td><td>{won(b.amount_krw)}</td></tr>)}</tbody></table>)}
        </section>
        <section className="card">
          <h2>최근 운영 기록</h2>
          <ul className="log">{log.map((e) => (
            <li key={e.id}><time>{fmt(e.created_at)}</time> <strong>{e.actor_label}</strong> · {ACTION[e.action] ?? e.action}{e.school_id && <span className="muted"> · {names[e.school_id] ?? ''}</span>}</li>
          ))}</ul>
        </section>
      </div>
    </>
  );
}
