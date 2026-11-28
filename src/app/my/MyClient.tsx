'use client';
import { Field } from '@/components/Field';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

// failed: 서버가 오류 문구를 주지 않을 때 보일 글(화면 언어로 넘긴다)
async function post(url: string, body: unknown, failed: string) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? failed);
  return data;
}

/** 63차(ADR 0030): 열람·수정 요청 내기 */
export function RequestForm({ personId }: { personId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [kind, setKind] = useState<'amend' | 'inspect'>('amend');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try { await post('/api/my/requests', { personId, kind, body }, t('common.failed')); setBody(''); setMsg({ text: t('my.sent') }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={send} data-testid="my-request-form">
      <fieldset><legend>{t('my.whatRequest')}</legend><div className="row-wrap">
        <label className="radio"><input type="radio" name="req-kind" checked={kind === 'amend'} onChange={() => setKind('amend')} />{t('my.kindAmend')}</label>
        <label className="radio"><input type="radio" name="req-kind" checked={kind === 'inspect'} onChange={() => setKind('inspect')} />{t('my.kindInspect')}</label>
      </div></fieldset>
      <Field label={t('my.body')} required hint={t('my.requestNote')} count={{ value: body.length, max: 2000 }}>
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000}
          placeholder={t(kind === 'amend' ? 'my.amendPlaceholder' : 'my.inspectPlaceholder')} /></Field>
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={!body.trim()}>{t('my.send')}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}

/** 거부된 수정 요청에 이의 의견서 붙이기(한 번) */
export function AnnotateForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    try { await post('/api/my/requests/annotate', { requestId, body }, t('common.failed')); setMsg({ text: t('my.annotated') }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  return (
    <form className="stack" onSubmit={send}>
      <Field label={t('my.statement')} required count={{ value: body.length, max: 2000 }}><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={t('my.statementPlaceholder')} /></Field>
      <div className="form-actions"><button type="submit" className="btn" disabled={!body.trim()}>{t('my.attach')}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
