'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, TextArea, TextField } from '@radix-ui/themes';
import { useI18n } from './I18nProvider';

/**
 * 71차: 학사 화면 공용 작은 양식. 칸을 모아 { action, ...extra, ...값 }을 JSON으로 보내고, 성공하면 화면을 새로 고친다.
 * 쓰기 권한·검사는 서버(DB 명령 함수)가 한다. 화면은 오류 문구를 그대로 보여 준다.
 */
export type FieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'full';
export type FieldSpec = {
  /** json: 여러 줄 글상자에 JSON을 쓰고, 보낼 때 값으로 바꿔 보낸다(AI 초안 붙여 넣기, 128차) */
  name: string; label: string; type?: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'email' | 'json';
  options?: { value: string; label: string }[]; required?: boolean; placeholder?: string; defaultValue?: string;
  /** 칸 너비(ADR 0045 양식 배치 규약). 안 적으면 종류·내용 길이로 정한다. narrow·wide 는 옛 이름(sm·full) */
  width?: FieldSize | 'narrow' | 'wide';
};

/**
 * 칸 너비 정하기: 들어갈 내용 길이에 맞춘다(GOV.UK 'match input width to expected content').
 * 숫자 xs · 날짜 sm · 메일 lg · 긴 글 full · 선택은 가장 긴 보기 글자 수로(xs~lg) · 글자 칸은 md
 */
export function fieldSize(f: FieldSpec): FieldSize {
  if (f.width === 'wide') return 'full';
  if (f.width === 'narrow') return 'sm';
  if (f.width) return f.width;
  switch (f.type) {
    case 'number': return 'xs';
    case 'date': return 'sm';
    case 'email': return 'lg';
    case 'textarea': case 'json': return 'full';
    case 'select': {
      const longest = Math.max(0, ...(f.options ?? []).map((o) => [...o.label].length));
      return longest <= 4 ? 'xs' : longest <= 10 ? 'sm' : longest <= 18 ? 'md' : 'lg';
    }
    default: return 'md';
  }
}
/**
 * 128차: 저장 전에 미리 계산해 보기. 같은 주소에 { action: preview.action, ...값 }을 보내고, 답 { issues, results }를 표로 보여 준다.
 * required 면 지금 넣은 값으로 미리 계산해 문제가 없을 때만 저장 단추가 열린다(값을 고치면 다시 닫힌다).
 */
export type PreviewSpec = { action: string; label: string; columns: { key: string; label: string }[]; required?: boolean; issuesLabel: string };
type PreviewResult = { issues: { path: string; message: string }[]; results: Record<string, unknown>[] };
const cell = (v: unknown, t: (k: 'common.yes' | 'common.no') => string) => (v == null ? '-' : v === true ? t('common.yes') : v === false ? t('common.no') : String(v));

export function ActionForm({ url, action, fields, extra = {}, submitLabel, successText, testId, inline = false, confirmText, keep = false, tone = 'primary', preview }: {
  url: string; action?: string; fields: FieldSpec[]; extra?: Record<string, unknown>; submitLabel: string; successText?: string; testId?: string; inline?: boolean;
  /** 되돌리기 어려운 일이면 확인 창 문구 */
  confirmText?: string;
  /** 단추 모양. 목록 줄마다 되풀이되는 부가 행동(예: 수강 철회)은 'secondary'로 주 행동과 구분한다(UI 점검 courses A1·A4) */
  tone?: 'primary' | 'secondary';
  /** 성공 뒤에도 넣은 값을 그대로 둔다(고쳐 쓰는 글 칸) */
  keep?: boolean;
  preview?: PreviewSpec;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const init = Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '')]));
  const [v, setV] = useState<Record<string, string>>(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [shown, setShown] = useState<{ key: string; r: PreviewResult } | null>(null);
  /** 보낼 몸. json 칸을 읽지 못하면 그 칸 이름과 함께 오류 문구를 돌려준다 */
  function bodyOf(act: string | undefined): { body?: Record<string, unknown>; error?: string } {
    const body: Record<string, unknown> = { ...(act ? { action: act } : {}), ...extra };
    for (const f of fields) {
      if (f.type === 'json') {
        if (v[f.name].trim() === '') { body[f.name] = null; continue; }
        try { body[f.name] = JSON.parse(v[f.name]); } catch { return { error: t('form.jsonInvalid', { field: f.label }) }; }
      } else body[f.name] = f.type === 'number' ? (v[f.name] === '' ? null : Number(v[f.name])) : v[f.name];
    }
    return { body };
  }
  const valuesKey = JSON.stringify(v);
  const previewOk = !preview?.required || (shown?.key === valuesKey && shown.r.issues.length === 0);
  async function runPreview() {
    if (!preview) return;
    const { body, error } = bodyOf(preview.action);
    if (!body) return setMsg({ text: error!, error: true });
    setBusy(true); setMsg(null);
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setShown(null); return setMsg({ text: data.error ?? t('common.failed'), error: true }); }
    setShown({ key: valuesKey, r: { issues: Array.isArray(data.issues) ? data.issues : [], results: Array.isArray(data.results) ? data.results : [] } });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!previewOk) return runPreview();
    const { body, error } = bodyOf(action);
    if (!body) return setMsg({ text: error!, error: true });
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: data.error ?? t('common.failed'), error: true });
    setMsg({ text: successText ?? t('common.saved') });
    if (!keep) { setV(init); setShown(null); }
    router.refresh();
  }
  // inline: 칸을 한 줄에 내용 길이대로 놓고 단추는 마지막 칸 옆 바닥선에. 아니면 위에서 아래로(칸 너비는 그대로)
  return (
    <form className="action-form form-grid" data-stack={inline ? undefined : ''} onSubmit={submit} data-testid={testId}>
      {fields.map((f) => {
        const on = (e: { target: { value: string } }) => setV({ ...v, [f.name]: e.target.value });
        return (
          <label key={f.name} className="ff" data-size={fieldSize(f)}><span>{f.label}</span>
            {f.type === 'select'
              ? <select value={v[f.name]} onChange={on} required={f.required}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'json'
                ? <TextArea className="json-input" rows={Math.min(16, Math.max(4, v[f.name].split('\n').reduce((n, l) => n + Math.ceil((l.length + 1) / 100), 1)))} spellCheck={false} value={v[f.name]} onChange={on} required={f.required} placeholder={f.placeholder} />
              : f.type === 'textarea'
                ? <TextArea rows={3} spellCheck value={v[f.name]} onChange={on} required={f.required} placeholder={f.placeholder} />
                // Radix TextField 는 맞춤법 검사를 기본으로 끈다. 글 칸(이유·메모·제목)은 브라우저 맞춤법 도움을 되살린다(Codex #201)
                : <TextField.Root type={f.type ?? 'text'} value={v[f.name]} onChange={on} required={f.required} placeholder={f.placeholder} spellCheck={(f.type ?? 'text') === 'text'} />}
          </label>
        );
      })}
      <div className="form-go">
        {preview && <Button type="button" variant={previewOk ? 'soft' : 'solid'} disabled={busy} onClick={runPreview}>{preview.label}</Button>}
        <Button type="submit" variant={tone === 'secondary' || !previewOk ? 'soft' : 'solid'} disabled={busy || !previewOk}>{submitLabel}</Button>
      </div>
      {preview && shown && (
        <div className="preview-result" data-stale={shown.key !== valuesKey ? '' : undefined}>
          {shown.r.issues.length > 0 && (
            <div className="alert" role="status"><strong>{preview.issuesLabel}</strong>
              <ul>{shown.r.issues.slice(0, 20).map((i, n) => <li key={n}><code>{i.path || '-'}</code> {i.message}</li>)}</ul></div>)}
          {shown.r.results.length > 0 && (
            <div className="table-wrap"><table className="grid-table">
              <thead><tr>{preview.columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
              <tbody>{shown.r.results.map((r, n) => <tr key={n}>{preview.columns.map((c, i) => i === 0 ? <th key={c.key} scope="row">{cell(r[c.key], t)}</th> : <td key={c.key}>{cell(r[c.key], t)}</td>)}</tr>)}</tbody>
            </table></div>)}
        </div>)}
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
