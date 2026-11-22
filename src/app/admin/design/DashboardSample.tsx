import { Bell, ChevronDown, FileText, LayoutDashboard, MessageSquareWarning, Search, Settings, School, Users, Wallet, Plus } from 'lucide-react';

/** 디자인 방향 비교용 견본: 모든 방향이 같은 내용을 그린다(합성 자료). */
const ROWS = [
  { name: '드리미 예시학교', slug: 'school-a', status: ['운영', 'success'], seats: '18 / 20', amount: '360,000원', q: 2 },
  { name: 'Rungarun Example School', slug: 'school-b', status: ['시범', 'info'], seats: '6 / 10', amount: '0원', q: 0 },
  { name: '소망 예시학교', slug: 'hope-school', status: ['이용 중지', 'danger'], seats: '3 / 5', amount: '—', q: 1 },
] as const;

function Spark({ points }: { points: number[] }) {
  const max = Math.max(...points), min = Math.min(...points);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / (max - min || 1)) * 24}`).join(' ');
  return <svg className="dv-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={d} fill="none" strokeWidth="2" /></svg>;
}

export function DashboardSample() {
  return (
    <div className="dv-app">
      <aside className="dv-side">
        <div className="dv-brand"><span className="dv-mark">學</span><span>학교 운영</span></div>
        <div className="dv-label">전체 관리</div>
        <a className="dv-nav is-active"><LayoutDashboard size={16} />대시보드</a>
        <a className="dv-nav"><School size={16} />학교·라이선스</a>
        <a className="dv-nav"><FileText size={16} />개발·연구소</a>
        <a className="dv-nav"><Settings size={16} />설정</a>
      </aside>
      <div className="dv-main">
        <div className="dv-top">
          <button className="dv-switch" type="button">전체 관리 <ChevronDown size={14} /></button>
          <div className="dv-search"><Search size={14} />검색 <kbd>Ctrl K</kbd></div>
          <span className="dv-icon-btn"><Bell size={16} /></span>
          <span className="dv-avatar">예</span>
        </div>
        <div className="dv-body">
          <div className="dv-head">
            <div><div className="dv-crumb">전체 관리 › 대시보드</div><h3>학교 운영 현황</h3></div>
            <button className="dv-primary" type="button"><Plus size={14} />학교 만들기</button>
          </div>
          <div className="dv-kpis">
            <div className="dv-kpi"><div className="dv-kpi-top"><School size={16} />학교</div><strong>3곳</strong><Spark points={[1, 1, 2, 2, 3, 3]} /></div>
            <div className="dv-kpi"><div className="dv-kpi-top"><Users size={16} />좌석 사용</div><strong>27 / 35</strong><Spark points={[10, 14, 15, 20, 24, 27]} /></div>
            <div className="dv-kpi"><div className="dv-kpi-top"><Wallet size={16} />월 청구 예정</div><strong>360,000원</strong><Spark points={[0, 0, 120, 240, 240, 360]} /></div>
            <div className="dv-kpi is-warn"><div className="dv-kpi-top"><MessageSquareWarning size={16} />확인 대기</div><strong>3건</strong><Spark points={[5, 4, 6, 3, 4, 3]} /></div>
          </div>
          <div className="dv-card">
            <div className="dv-card-head"><span>학교</span><span className="dv-muted">3곳</span></div>
            <table className="dv-table">
              <thead><tr><th>학교</th><th>상태</th><th className="dv-num">좌석</th><th className="dv-num">월 예정액</th><th className="dv-num">질문</th></tr></thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.slug}>
                    <td><strong>{r.name}</strong><small>{r.slug}</small></td>
                    <td><span className="dv-badge" data-tone={r.status[1]}>{r.status[0]}</span></td>
                    <td className="dv-num">{r.seats}</td>
                    <td className="dv-num">{r.amount}</td>
                    <td className="dv-num">{r.q ? <span className="dv-badge" data-tone="warning">{r.q}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
