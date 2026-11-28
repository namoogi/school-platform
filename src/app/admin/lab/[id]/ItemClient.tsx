'use client';
import { Field } from '@/components/Field';
import { useI18n } from '@/components/I18nProvider';
import { baseT } from '@/lib/i18n/base';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, Kind } from '@/lib/lab';
import { RichDoc } from '@/components/RichDoc';

type Kinds = Record<Kind, { label: string; statuses: Record<string, string> }>;
async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? baseT('common.failed'));
  return data;
}

const HELP = `> **요약** 세 줄 이내 핵심 요약(카드에도 이 글이 보임)
> **왜** 이 기능이 왜 필요한가

\`\`\`terms
RLS | 줄마다 누가 볼 수 있는지 DB가 검사하는 규칙 | A학교 교사는 B학교 성적을 못 봄
\`\`\`

## 제목
문단은 그냥 적습니다. **굵게**, \`코드\`, [링크](https://…)

| 칸 | 칸 |
|---|---|
| 값 | 값 |

\`\`\`kpi
월 원가 | $260 | 100곳·확장 20%
\`\`\`
\`\`\`steps
신청 | 관리자 승인
자동 생성 | 30~60초
\`\`\`
\`\`\`bars
공용형 | 1 | $0.2~1
확장형 | 15 | +$10~15
\`\`\`
\`\`\`tiers
공용형 | 대부분 학교 | 기본
전용형 | 큰 학교 | 선택
\`\`\`
> **결정** 선생님이 고를 것`;

/** 상태·우선순위·태그·본문 고치기(미리 보기) · 보관 */
export function ItemControls({ item, kinds, priorities }: { item: Item; kinds: Kinds; priorities: Record<string, string> }) {
  const router = useRouter();
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: item.title, body: item.body, tags: item.tags.join(', '), link: item.link ?? '', due_date: item.due_date ?? '' });
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) { setErr(null); try { await fn(); router.refresh(); } catch (e) { setErr((e as Error).message); } }
  return (
    <section className="card stack" data-testid="lab-controls">
      <h2>{t('lab.manage')}</h2>
      <label>{t('lab.status')}<select value={item.status} onChange={(e) => run(() => call(`/api/admin/items/${item.id}`, 'PATCH', { status: e.target.value }))}>
        {Object.entries(kinds[item.kind].statuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>{t('lab.priority')}<select value={item.priority} onChange={(e) => run(() => call(`/api/admin/items/${item.id}`, 'PATCH', { priority: e.target.value }))}>
        {Object.entries(priorities).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="row-wrap">
        <button type="button" className="btn btn-sm" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? t('lab.closeEdit') : t('lab.edit')}</button>
        <button type="button" className="btn btn-sm" onClick={() => run(() => call(`/api/admin/items/${item.id}`, 'PATCH', { archived: !item.archived_at }))}>{item.archived_at ? t('lab.unarchive') : t('common.archive')}</button>
      </div>
      {err && <p className="alert" role="alert">{err}</p>}
      {edit && (
        <div className="lab-editor stack" data-testid="lab-editor">
          <label>{t('lab.title')}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <div className="row-wrap" role="tablist">
            <button type="button" role="tab" aria-selected={!preview} className={`btn btn-sm${!preview ? ' btn-primary' : ''}`} onClick={() => setPreview(false)}>{t('lab.write')}</button>
            <button type="button" role="tab" aria-selected={preview} className={`btn btn-sm${preview ? ' btn-primary' : ''}`} onClick={() => setPreview(true)}>{t('lab.preview')}</button>
          </div>
          {preview ? <div className="lab-preview"><RichDoc body={f.body} t={t} /></div>
            : <label>{t('lab.body')}<textarea rows={16} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>}
          <details><summary>{t('lab.help')}</summary><pre className="copy-box">{HELP}</pre></details>
          <label>{t('lab.tags')}<input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
          <label>{t('lab.link')}<input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /></label>
          <label>{t('lab.dueAria')}<input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
          <button type="button" className="btn btn-primary" onClick={() => run(async () => {
            await call(`/api/admin/items/${item.id}`, 'PATCH', { ...f, link: f.link || null, due_date: f.due_date || null }); setEdit(false);
          })}>{t('lab.save')}</button>
        </div>)}
    </section>
  );
}

/** 하단 지침: 관제 센터 '지시'와 같은 길(createDirective, lab_item_id 연결). 받는 곳 기본값은 관제 세션 */
export function DirectiveForm({ item, sessions }: { item: { id: string; title: string }; sessions: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const control = sessions.find((s) => s.name.includes('관제')) ?? sessions[0];
  const [body, setBody] = useState('');
  const [to, setTo] = useState(control?.id ?? 'new');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const url = typeof window !== 'undefined' ? `${window.location.origin}/admin/lab/${item.id}` : '';
      await call('/api/admin/control/requests', 'POST', {
        title: `[연구소 지침] ${item.title}`.slice(0, 200),
        detail: `연구소 항목: ${url}\n세션은 지침대로 진행하고, 항목 본문을 고쳤으면 PATCH /api/admin/items/${item.id}, 결과는 이 요청에 보고(messages)한다.`,
        body, lab_item_id: item.id, ...(to === 'new' ? { new_session: true } : { target_session: to }),
      });
      setBody(''); setMsg({ text: t('lab.sent') });
      router.refresh();
    } catch (err) { setMsg({ text: (err as Error).message, error: true }); }
    setBusy(false);
  }
  return (
    <form className="stack lab-directive-form" onSubmit={send} data-testid="directive-form">
      <Field label={t('lab.newDirective')} required><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('lab.directivePlaceholder')} /></Field>
      <div className="row-wrap">
        <label>{t('lab.toSession')}<select value={to} onChange={(e) => setTo(e.target.value)}>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="new">{t('cc.newSession')}</option></select></label>
        <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>{t('lab.send')}</button>
      </div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
