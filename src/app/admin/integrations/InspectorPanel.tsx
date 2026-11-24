'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InspectorToken } from '@/lib/inspector';

const when = (d: string | null) => (d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');

/** Claude 점검 접근: 토큰 발급(원문은 한 번만 표시)·목록·폐기 */
export function InspectorPanel({ tokens, readOnly }: { tokens: InspectorToken[]; readOnly: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [issued, setIssued] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    setErr(null);
    const res = await fetch('/api/admin/inspector', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Claude 세션', days }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error ?? '발급하지 못했습니다.');
    setIssued(data.token); router.refresh();
  }
  async function revoke(id: string) {
    const res = await fetch(`/api/admin/inspector/${id}`, { method: 'DELETE' });
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? '폐기하지 못했습니다.');
    router.refresh();
  }
  const active = tokens.filter((t) => !t.revoked_at && new Date(t.expires_at) > new Date());
  return (
    <section className="card" data-testid="inspector-panel">
      <div className="card-header">
        <div><h2>Claude 점검 접근</h2>
          <p>관제 Claude 세션이 로그인 없이 전체 관리자로 일합니다(ADR 0024). 학교 입장·변경은 사람 전체 관리자와 같이 기록됩니다. 토큰은 이 화면에서만 발급·폐기합니다.</p></div>
        <span className="badge" data-tone={active.length ? 'success' : 'neutral'}>{active.length ? `사용 중 ${active.length}개` : '없음'}</span>
      </div>
      {!readOnly && (
        <div className="row-wrap" style={{ alignItems: 'end' }}>
          <label>기한
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7일</option><option value={30}>30일</option><option value={90}>90일</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={create}>점검 토큰 발급</button>
        </div>
      )}
      {issued && (
        <div className="banner" data-tone="warning" role="status">
          <p><b>지금 한 번만 보입니다.</b> Claude 세션이 띄우는 <b>자격 증명 입력 창</b>(호스트 onschools.vercel.app, 머리 이름 x-inspector-token)에 붙여 넣으세요. 채팅에는 붙여 넣지 마세요.</p>
          <pre className="copy-box" data-testid="issued-token">{issued}</pre>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(issued)}>복사</button>
        </div>
      )}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {tokens.length > 0 && (
        <table className="grid-table">
          <thead><tr><th scope="col">이름</th><th scope="col">발급</th><th scope="col">기한</th><th scope="col">마지막 사용</th><th scope="col">상태</th><th scope="col"><span className="sr-only">동작</span></th></tr></thead>
          <tbody>{tokens.map((t) => {
            const live = !t.revoked_at && new Date(t.expires_at) > new Date();
            return (
              <tr key={t.id}>
                <td>{t.label}</td><td>{when(t.created_at)}</td><td>{when(t.expires_at)}</td><td>{when(t.last_used_at)}</td>
                <td><span className="badge" data-tone={live ? 'success' : 'neutral'}>{t.revoked_at ? '폐기됨' : live ? '사용 가능' : '기한 지남'}</span></td>
                <td>{live && !readOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(t.id)}>폐기</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <p className="fine">토큰 원문은 저장하지 않고 해시만 남깁니다. 발급·폐기는 운영 기록에 남고, 이상하면 바로 폐기하세요.</p>
    </section>
  );
}
