'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}

/** 63차(ADR 0030): 열람·수정 요청 내기 */
export function RequestForm({ personId }: { personId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<'amend' | 'inspect'>('amend');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try { await post('/api/my/requests', { personId, kind, body }); setBody(''); setMsg({ text: '요청을 보냈습니다. 학교가 기한 안에 답합니다.' }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={send} data-testid="my-request-form">
      <fieldset><legend>무엇을 요청하나요?</legend><div className="row-wrap">
        <label className="radio"><input type="radio" name="req-kind" checked={kind === 'amend'} onChange={() => setKind('amend')} />기록 바로잡기(수정 요청)</label>
        <label className="radio"><input type="radio" name="req-kind" checked={kind === 'inspect'} onChange={() => setKind('inspect')} />원래 기록 보기(열람 요청)</label>
      </div></fieldset>
      <label>내용<textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required
        placeholder={kind === 'amend' ? '어느 기록의 무엇이 사실과 다른지 적어 주세요.' : '보고 싶은 기록을 적어 주세요.'} /></label>
      <p className="fine">성적·평가 같은 판단 자체는 수정 요청 대상이 아닐 수 있습니다. 잘못 적힌 사실은 바로잡을 수 있습니다.</p>
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={!body.trim()}>요청 보내기</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}

/** 거부된 수정 요청에 이의 의견서 붙이기(한 번) */
export function AnnotateForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try { await post('/api/my/requests/annotate', { requestId, body }); setMsg({ text: '의견서를 붙였습니다. 이후 발행본에 함께 실립니다.' }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={send}>
      <label>이의 의견서<textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required placeholder="기록에 함께 남길 나의 진술" /></label>
      <div className="form-actions"><button type="submit" className="btn" disabled={!body.trim()}>의견서 붙이기</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
