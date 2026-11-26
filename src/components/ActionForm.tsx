'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 71차: 학사 화면 공용 작은 양식. 칸을 모아 { action, ...extra, ...값 }을 JSON으로 보내고, 성공하면 화면을 새로 고친다.
 * 쓰기 권한·검사는 서버(DB 명령 함수)가 한다. 화면은 오류 문구를 그대로 보여 준다.
 */
export type FieldSpec = {
  name: string; label: string; type?: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'email';
  options?: { value: string; label: string }[]; required?: boolean; placeholder?: string; defaultValue?: string; width?: 'narrow' | 'wide';
};
export function ActionForm({ url, action, fields, extra = {}, submitLabel, successText, testId, inline = false, confirmText }: {
  url: string; action?: string; fields: FieldSpec[]; extra?: Record<string, unknown>; submitLabel: string; successText?: string; testId?: string; inline?: boolean;
  /** 되돌리기 어려운 일이면 확인 창 문구 */
  confirmText?: string;
}) {
  const router = useRouter();
  const init = Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '')]));
  const [v, setV] = useState<Record<string, string>>(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    const body: Record<string, unknown> = { ...(action ? { action } : {}), ...extra };
    for (const f of fields) body[f.name] = f.type === 'number' ? (v[f.name] === '' ? null : Number(v[f.name])) : v[f.name];
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: data.error ?? '처리하지 못했습니다.', error: true });
    setMsg({ text: successText ?? '저장했습니다.' });
    setV(init);
    router.refresh();
  }
  return (
    <form className={inline ? 'action-form action-form-inline' : 'action-form'} onSubmit={submit} data-testid={testId}>
      {fields.map((f) => (
        <label key={f.name} className={f.width === 'wide' ? 'wide' : undefined}>{f.label}
          {f.type === 'select'
            ? <select value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} required={f.required}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : f.type === 'textarea'
              ? <textarea rows={3} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} required={f.required} placeholder={f.placeholder} />
              : <input type={f.type ?? 'text'} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} required={f.required} placeholder={f.placeholder} />}
        </label>
      ))}
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
