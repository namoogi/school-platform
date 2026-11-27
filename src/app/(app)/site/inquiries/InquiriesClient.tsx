'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Inquiry } from '@/lib/site-inquiries';

const INQUIRY_KIND_LABEL: Record<Inquiry['kind'], string> = { visit: '학교 방문', consult: '입학 상담', question: '문의' };

export function InquiriesClient({ inquiries }: { inquiries: Inquiry[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [days, setDays] = useState(365);
  const call = async (url: string, method: string, body: unknown) => {
    setMsg(null);
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ text: data.error ?? '처리하지 못했습니다.', error: true }); return null; }
    router.refresh();
    return data;
  };
  const fresh = inquiries.filter((i) => i.status === 'new').length;
  return (
    <div className="stack">
      {inquiries.length === 0
        ? <p className="muted" data-testid="inquiries-empty">아직 받은 신청이 없습니다. 쪽에 '방문·상담 신청' 블록을 넣고 설정에서 '신청 받기'를 켜면 방문자가 신청을 남길 수 있습니다.</p>
        : <>
            <p className="fine">모두 {inquiries.length}건 · 처리 전 {fresh}건</p>
            <div className="table-wrap">
              <table className="grid-table" data-testid="inquiries">
                <thead><tr><th scope="col">받은 날</th><th scope="col">종류</th><th scope="col">이름</th><th scope="col">연락처</th><th scope="col">희망 날짜</th><th scope="col">남긴 말</th><th scope="col">상태</th></tr></thead>
                <tbody>{inquiries.map((i) => (
                  <tr key={i.id}>
                    <td>{new Date(i.created_at).toLocaleDateString('ko-KR')}</td>
                    <td>{INQUIRY_KIND_LABEL[i.kind]}</td>
                    <td>{i.name}</td>
                    <td>{i.contact}</td>
                    <td>{i.preferred_date ?? '—'}</td>
                    <td>{i.message ?? '—'}{i.page ? <small className="muted"> · {i.page}</small> : null}</td>
                    <td>{i.redacted_at ? '가림' : (
                      <button type="button" className="btn btn-sm" aria-pressed={i.status === 'done'} onClick={() => call(`/api/site/inquiries/${i.id}`, 'PATCH', { status: i.status === 'done' ? 'new' : 'done' })}
                        data-testid="inquiry-toggle">{i.status === 'done' ? '처리함 ✓' : '처리 전'}</button>)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>}
      <details className="card">
        <summary>오래된 신청 가리기</summary>
        <div className="stack">
          <p className="fine">정한 날수보다 오래된 신청의 이름·연락처·남긴 말·희망 날짜를 '(가림)'으로 바꿉니다. 되돌릴 수 없습니다. 기록 자체(받은 날·종류)는 남습니다.</p>
          <label>보존 기간(일)<input type="number" min={30} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <div className="form-actions"><button type="button" className="btn btn-danger" onClick={async () => {
            const r = await call('/api/site/inquiries/redact', 'POST', { keep_days: days });
            if (r) setMsg({ text: `${r.redacted}건을 가렸습니다.` });
          }}>{days}일 지난 신청 가리기</button></div>
        </div>
      </details>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}
